/**
 * VegaMCP — AI-Driven Elicitation (MCP 2025-06-18, modified)
 * Instead of asking the USER for input, this asks the AI model (via MCP Sampling)
 * for structured input when a tool needs additional context or clarification.
 *
 * Flow: Tool needs more info → requestElicitation() → AI responds → Tool resumes
 */

import { requestSampling, isSamplingAvailable } from '../mcp-extensions.js';

export interface ElicitationSchema {
  type: 'string' | 'number' | 'boolean' | 'enum';
  description: string;
  enumValues?: string[];
  default?: any;
  required?: boolean;
}

export interface ElicitationRequest {
  message: string;
  requestedFields: Record<string, ElicitationSchema>;
  context?: string;  // Additional context for the AI
}

export interface ElicitationResponse {
  success: boolean;
  fields: Record<string, any>;
  reasoning?: string;
}

/**
 * Request structured input from the AI model via MCP Sampling.
 * The AI analyzes the context and provides the needed information.
 */
export async function requestElicitation(request: ElicitationRequest): Promise<ElicitationResponse> {
  if (!isSamplingAvailable()) {
    // Fallback: return defaults when sampling unavailable
    const defaults: Record<string, any> = {};
    for (const [key, schema] of Object.entries(request.requestedFields)) {
      defaults[key] = schema.default ?? getTypeDefault(schema.type);
    }
    return { success: false, fields: defaults, reasoning: 'Sampling unavailable — using defaults' };
  }

  // Build a structured prompt for the AI
  const fieldDescriptions = Object.entries(request.requestedFields)
    .map(([key, schema]) => {
      let desc = `- **${key}** (${schema.type}): ${schema.description}`;
      if (schema.enumValues) desc += ` [options: ${schema.enumValues.join(', ')}]`;
      if (schema.default !== undefined) desc += ` [default: ${schema.default}]`;
      if (schema.required) desc += ` [REQUIRED]`;
      return desc;
    })
    .join('\n');

  const prompt = `You are being asked to provide structured input for a tool that needs more context.

${request.context ? `Context: ${request.context}\n` : ''}
Question: ${request.message}

Please provide values for these fields:
${fieldDescriptions}

Respond with ONLY a JSON object containing the field values. No explanation, just the JSON.
Example: {"field1": "value1", "field2": 42}`;

  try {
    const result = await requestSampling(prompt, {
      maxTokens: 500,
      temperature: 0.3,
    });

    // Parse the AI's response as JSON
    const responseText = typeof result === 'string' ? result : (result as any)?.content?.text || JSON.stringify(result);
    
    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    
    // Try to find a JSON object in the response
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];

    const parsed = JSON.parse(jsonStr);
    
    // Validate and coerce types
    const fields: Record<string, any> = {};
    for (const [key, schema] of Object.entries(request.requestedFields)) {
      if (parsed[key] !== undefined) {
        fields[key] = coerceType(parsed[key], schema.type);
      } else if (schema.default !== undefined) {
        fields[key] = schema.default;
      } else if (schema.required) {
        fields[key] = getTypeDefault(schema.type);
      }
    }

    return { success: true, fields, reasoning: `AI provided ${Object.keys(fields).length} fields` };
  } catch (err: any) {
    // On error, return defaults
    const defaults: Record<string, any> = {};
    for (const [key, schema] of Object.entries(request.requestedFields)) {
      defaults[key] = schema.default ?? getTypeDefault(schema.type);
    }
    return { success: false, fields: defaults, reasoning: `Elicitation error: ${err.message}` };
  }
}

/**
 * Convenience: Ask the AI a simple yes/no question
 */
export async function elicitConfirmation(question: string, context?: string): Promise<boolean> {
  const result = await requestElicitation({
    message: question,
    context,
    requestedFields: {
      confirmed: { type: 'boolean', description: question, default: false, required: true },
    },
  });
  return result.fields.confirmed === true;
}

/**
 * Convenience: Ask the AI to choose from options
 */
export async function elicitChoice(question: string, options: string[], context?: string): Promise<string> {
  const result = await requestElicitation({
    message: question,
    context,
    requestedFields: {
      choice: { type: 'enum', description: question, enumValues: options, default: options[0], required: true },
    },
  });
  return result.fields.choice || options[0];
}

/**
 * Convenience: Ask the AI for a text value
 */
export async function elicitText(question: string, context?: string, defaultValue?: string): Promise<string> {
  const result = await requestElicitation({
    message: question,
    context,
    requestedFields: {
      value: { type: 'string', description: question, default: defaultValue || '', required: true },
    },
  });
  return result.fields.value || defaultValue || '';
}

function getTypeDefault(type: string): any {
  switch (type) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'enum': return '';
    default: return null;
  }
}

function coerceType(value: any, type: string): any {
  switch (type) {
    case 'string': return String(value);
    case 'number': return Number(value) || 0;
    case 'boolean': return value === true || value === 'true' || value === 1;
    case 'enum': return String(value);
    default: return value;
  }
}

// Schema and handler for an elicitation tool
export const elicitationSchema = {
  name: 'elicit',
  description: 'Ask the AI model for structured input when more context is needed. Uses MCP Sampling to request information from the reasoning model. Supports text, number, boolean, and enum field types.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      message: { type: 'string', description: 'What information is needed' },
      context: { type: 'string', description: 'Additional context for the AI' },
      fields: {
        type: 'object',
        description: 'Fields to request: { fieldName: { type, description, enumValues?, default? } }',
        additionalProperties: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['string', 'number', 'boolean', 'enum'] },
            description: { type: 'string' },
            enumValues: { type: 'array', items: { type: 'string' } },
            default: {},
          },
        },
      },
    },
    required: ['message', 'fields'],
  },
};

export async function handleElicitation(args: any): Promise<any> {
  try {
    const fields: Record<string, ElicitationSchema> = {};
    for (const [key, spec] of Object.entries(args.fields || {})) {
      const s = spec as any;
      fields[key] = {
        type: s.type || 'string',
        description: s.description || key,
        enumValues: s.enumValues,
        default: s.default,
        required: true,
      };
    }

    const result = await requestElicitation({
      message: args.message,
      context: args.context,
      requestedFields: fields,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify({
        success: result.success,
        fields: result.fields,
        reasoning: result.reasoning,
        samplingAvailable: isSamplingAvailable(),
      }, null, 2) }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }],
    };
  }
}
