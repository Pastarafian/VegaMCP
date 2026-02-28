import { getAvailableTools } from '../index.js';
import { v7Schemas, v7Mapping } from './v7-unified-schemas.js';

export function getV7Tools() {
  const v6Tools = getAvailableTools();
  const v6Map = new Map();
  for (const t of v6Tools) {
    v6Map.set(t.schema.name, t);
  }

  const unified: any[] = [];
  for (const schema of v7Schemas) {
    const mapping = (v7Mapping as any)[schema.name];
    if (!mapping || mapping.length === 0) {
      unified.push({
        schema,
        handler: v6Map.get(schema.name)?.handler || (async () => ({ content: [{ type: 'text', text: 'Not found' }] })),
      });
      continue;
    }

    unified.push({
      schema,
      handler: async (args: any) => {
        const subAction = args.action;
        const mapped = mapping.find((m: any) => m.action === subAction);
        if (!mapped) throw new Error(`Unknown action: ${subAction} for tool ${schema.name}`);
        
        const v6Handler = v6Map.get(mapped.v6Name)?.handler;
        if (!v6Handler) throw new Error(`V6 Handler for ${mapped.v6Name} not found`);

        let mappedArgs = { ...args };
        if (mapped.v6Name === 'sandbox_execute') {
          mappedArgs.environment = args.language;
        }

        return v6Handler(mappedArgs);
      }
    });
  }
  return unified;
}
