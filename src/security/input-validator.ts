/**
 * VegaMCP — Input Validator
 * Schema enforcement and input sanitization for all tool calls.
 */

/** Maximum string lengths per parameter type */
const MAX_LENGTHS: Record<string, number> = {
  entityName: 200,
  observation: 2000,
  searchQuery: 500,
  jsCode: 10000,
  problemDescription: 20000,
  url: 2048,
  cssSelector: 500,
  comment: 1000,
  context: 2000,
  systemPrompt: 5000,
  default: 5000,
};

/**
 * Validate and truncate a string input.
 */
export function validateString(
  value: unknown,
  paramType: string = 'default',
  fieldName: string = 'value'
): { valid: boolean; value?: string; error?: string } {
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string, got ${typeof value}` };
  }

  const maxLen = MAX_LENGTHS[paramType] || MAX_LENGTHS.default;
  if (value.length > maxLen) {
    return {
      valid: false,
      error: `${fieldName} exceeds maximum length of ${maxLen} characters (got ${value.length})`,
    };
  }

  if (value.trim().length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty or whitespace-only` };
  }

  return { valid: true, value: value.trim() };
}

/**
 * Sanitize output from external sources (Sentry, browser console)
 * to prevent prompt injection attacks.
 */
export function sanitizeExternalOutput(text: string, maxLength: number = 5000): string {
  let sanitized = text;

  // Known prompt injection patterns to strip
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/gi,
    /system\s*:\s*/gi,
    /assistant\s*:\s*/gi,
    /\buser\s*:\s*/gi,
    /you\s+are\s+now\s+/gi,
    /forget\s+(all\s+)?previous\s+/gi,
    /new\s+instructions?\s*:/gi,
    /override\s+system\s+prompt/gi,
  ];

  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '[SANITIZED]');
  }

  // Remove embedded base64 data (potential data exfiltration)
  sanitized = sanitized.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]{100,}/g, '[BASE64_DATA_REMOVED]');

  // Remove URLs containing common auth patterns
  sanitized = sanitized.replace(/https?:\/\/[^\s]*(?:token|key|secret|password|auth)[^\s]*/gi, '[URL_WITH_CREDENTIALS_REMOVED]');

  // Truncate
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + `\n... [truncated at ${maxLength} chars]`;
  }

  return sanitized;
}

/**
 * Validate a number is within bounds.
 */
export function validateNumber(
  value: unknown,
  min: number,
  max: number,
  fieldName: string = 'value'
): { valid: boolean; value?: number; error?: string } {
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: `${fieldName} must be a valid number` };
  }
  if (value < min || value > max) {
    return { valid: false, error: `${fieldName} must be between ${min} and ${max}` };
  }
  return { valid: true, value };
}
