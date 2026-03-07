/**
 * VegaMCP — Image Generation Engine
 * 
 * Generate images from text prompts using local or cloud AI.
 * 
 * Providers (user-selectable):
 *   LOCAL:
 *     - Stable Diffusion (ComfyUI API at localhost:8188)
 *     - Stable Diffusion (Automatic1111 API at localhost:7860)
 *     - Ollama vision models (if available)
 *   CLOUD:
 *     - Stability AI (stability.ai REST API)
 *     - OpenAI DALL-E 3
 *     - Together AI (Flux models)
 * 
 * User can:
 *   - Force provider: 'local', 'cloud', or 'auto' (try local first)
 *   - Select specific model manually
 *   - Disable cloud or local entirely via config
 *   - Set image dimensions, quality, style
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const OUTPUT_DIR = path.join(os.homedir(), '.claw-memory', 'generated-images');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Provider configuration — user can override via env vars
interface ProviderConfig {
  enabled: boolean;
  type: 'local' | 'cloud';
  name: string;
  endpoint: string;
  apiKey?: string;
  models: string[];
  defaultModel: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  // ─── Local Providers ───
  comfyui: {
    enabled: true,
    type: 'local',
    name: 'ComfyUI (Local Stable Diffusion)',
    endpoint: process.env.COMFYUI_URL || 'http://127.0.0.1:8188',
    models: ['sd_xl_base_1.0', 'sdxl_turbo', 'sd3_medium', 'flux_dev', 'flux_schnell'],
    defaultModel: 'sdxl_turbo',
  },
  automatic1111: {
    enabled: true,
    type: 'local',
    name: 'Automatic1111 (Local Stable Diffusion)',
    endpoint: process.env.A1111_URL || 'http://127.0.0.1:7860',
    models: ['sd_xl_base_1.0', 'sdxl_turbo', 'dreamshaper_8', 'realvisxl_v4'],
    defaultModel: 'sdxl_turbo',
  },
  ollama_vision: {
    enabled: true,
    type: 'local',
    name: 'Ollama (Local)',
    endpoint: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    models: ['llava', 'bakllava'],
    defaultModel: 'llava',
  },
  // ─── Cloud Providers ───
  stability: {
    enabled: !!process.env.STABILITY_API_KEY,
    type: 'cloud',
    name: 'Stability AI',
    endpoint: 'https://api.stability.ai',
    apiKey: process.env.STABILITY_API_KEY,
    models: ['stable-diffusion-xl-1024-v1-0', 'sd3-large', 'sd3-large-turbo', 'stable-image-core'],
    defaultModel: 'sd3-large-turbo',
  },
  openai: {
    enabled: !!process.env.OPENAI_API_KEY,
    type: 'cloud',
    name: 'OpenAI DALL-E',
    endpoint: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY,
    models: ['dall-e-3', 'dall-e-2', 'gpt-image-1'],
    defaultModel: 'dall-e-3',
  },
  together: {
    enabled: !!process.env.TOGETHER_API_KEY,
    type: 'cloud',
    name: 'Together AI',
    endpoint: 'https://api.together.xyz/v1',
    apiKey: process.env.TOGETHER_API_KEY,
    models: ['black-forest-labs/FLUX.1-schnell', 'black-forest-labs/FLUX.1-dev', 'stabilityai/stable-diffusion-xl-base-1.0'],
    defaultModel: 'black-forest-labs/FLUX.1-schnell',
  },
};

// ═══════════════════════════════════════════════════════════════
// User Preferences (runtime toggles)
// ═══════════════════════════════════════════════════════════════

let userPrefs = {
  allowLocal: true,
  allowCloud: true,
  preferredProvider: 'auto' as string, // 'auto', 'local', 'cloud', or specific provider name
  preferredModel: null as string | null,
};

const PREFS_FILE = path.join(os.homedir(), '.claw-memory', 'imagegen-prefs.json');
try {
  if (fs.existsSync(PREFS_FILE)) {
    userPrefs = { ...userPrefs, ...JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')) };
  }
} catch { /* fresh prefs */ }

function savePrefs() {
  try {
    const dir = path.dirname(PREFS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PREFS_FILE, JSON.stringify(userPrefs, null, 2));
  } catch { /* non-fatal */ }
}

// ═══════════════════════════════════════════════════════════════
// Provider Detection
// ═══════════════════════════════════════════════════════════════

async function isProviderAvailable(provider: ProviderConfig): Promise<boolean> {
  if (!provider.enabled) return false;
  
  if (provider.type === 'cloud') {
    return !!provider.apiKey;
  }

  // Local provider — check if the service is running
  try {
    const resp = await fetch(provider.endpoint, { signal: AbortSignal.timeout(3000) });
    return resp.ok || resp.status < 500;
  } catch {
    return false;
  }
}

async function getAvailableProviders(preference: string): Promise<ProviderConfig[]> {
  const available: ProviderConfig[] = [];

  for (const [, provider] of Object.entries(PROVIDERS)) {
    if (preference === 'local' && provider.type !== 'local') continue;
    if (preference === 'cloud' && provider.type !== 'cloud') continue;
    if (!userPrefs.allowLocal && provider.type === 'local') continue;
    if (!userPrefs.allowCloud && provider.type === 'cloud') continue;
    
    if (await isProviderAvailable(provider)) {
      available.push(provider);
    }
  }

  // Sort: local first (if preference is auto), then by name
  if (preference === 'auto') {
    available.sort((a, b) => {
      if (a.type === 'local' && b.type === 'cloud') return -1;
      if (a.type === 'cloud' && b.type === 'local') return 1;
      return 0;
    });
  }

  return available;
}

// ═══════════════════════════════════════════════════════════════
// Image Generation — Provider-Specific Implementations
// ═══════════════════════════════════════════════════════════════

interface GenOptions {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  style?: string;
  quality?: 'draft' | 'standard' | 'hd';
}

interface GenResult {
  success: boolean;
  provider: string;
  model: string;
  imagePath?: string;
  imageBase64?: string;
  width: number;
  height: number;
  duration_ms: number;
  error?: string;
  seed?: number;
}

async function generateWithComfyUI(provider: ProviderConfig, model: string, opts: GenOptions): Promise<GenResult> {
  const start = Date.now();
  const width = opts.width || 1024;
  const height = opts.height || 1024;
  const seed = opts.seed || Math.floor(Math.random() * 2147483647);

  // ComfyUI uses a workflow JSON API
  const workflow = {
    "3": { class_type: "KSampler", inputs: {
      seed, steps: opts.steps || 20, cfg: opts.cfg_scale || 7,
      sampler_name: "euler", scheduler: "normal",
      denoise: 1, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0]
    }},
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: model + '.safetensors' }},
    "5": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 }},
    "6": { class_type: "CLIPTextEncode", inputs: { text: opts.prompt, clip: ["4", 1] }},
    "7": { class_type: "CLIPTextEncode", inputs: { text: opts.negative_prompt || "ugly, blurry, low quality", clip: ["4", 1] }},
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] }},
    "9": { class_type: "SaveImage", inputs: { filename_prefix: "REDACTED", images: ["8", 0] }},
  };

  try {
    const resp = await fetch(`${provider.endpoint}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) throw new Error(`ComfyUI error: ${resp.status}`);
    const data = await resp.json() as any;
    const promptId = data.prompt_id;

    // Poll for completion
    let attempts = 0;
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 2000));
      const histResp = await fetch(`${provider.endpoint}/history/${promptId}`, { signal: AbortSignal.timeout(5000) });
      if (histResp.ok) {
        const hist = await histResp.json() as any;
        if (hist[promptId]?.outputs?.["9"]?.images?.[0]) {
          const img = hist[promptId].outputs["9"].images[0];
          const imgResp = await fetch(`${provider.endpoint}/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`);
          const buffer = Buffer.from(await imgResp.arrayBuffer());
          
          const outPath = path.join(OUTPUT_DIR, `comfyui_${Date.now()}.png`);
          fs.writeFileSync(outPath, buffer);
          
          return {
            success: true, provider: 'comfyui', model, imagePath: outPath,
            imageBase64: buffer.toString('base64').substring(0, 100) + '...',
            width, height, duration_ms: Date.now() - start, seed,
          };
        }
      }
      attempts++;
    }
    throw new Error('ComfyUI timed out after 120s');
  } catch (error: any) {
    return { success: false, provider: 'comfyui', model, width, height, duration_ms: Date.now() - start, error: error.message };
  }
}

async function generateWithA1111(provider: ProviderConfig, model: string, opts: GenOptions): Promise<GenResult> {
  const start = Date.now();
  const width = opts.width || 1024;
  const height = opts.height || 1024;

  try {
    const resp = await fetch(`${provider.endpoint}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: opts.prompt,
        negative_prompt: opts.negative_prompt || 'ugly, blurry, low quality, deformed',
        width, height,
        steps: opts.steps || 20,
        cfg_scale: opts.cfg_scale || 7,
        seed: opts.seed || -1,
        override_settings: model ? { sd_model_checkpoint: model } : undefined,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) throw new Error(`A1111 error: ${resp.status}`);
    const data = await resp.json() as any;

    if (data.images?.[0]) {
      const buffer = Buffer.from(data.images[0], 'base64');
      const outPath = path.join(OUTPUT_DIR, `a1111_${Date.now()}.png`);
      fs.writeFileSync(outPath, buffer);

      return {
        success: true, provider: 'automatic1111', model, imagePath: outPath,
        imageBase64: data.images[0].substring(0, 100) + '...',
        width, height, duration_ms: Date.now() - start,
        seed: data.parameters?.seed,
      };
    }
    throw new Error('No image returned');
  } catch (error: any) {
    return { success: false, provider: 'automatic1111', model, width, height, duration_ms: Date.now() - start, error: error.message };
  }
}

async function generateWithStability(provider: ProviderConfig, model: string, opts: GenOptions): Promise<GenResult> {
  const start = Date.now();
  const width = opts.width || 1024;
  const height = opts.height || 1024;

  try {
    const engineId = model || provider.defaultModel;
    const resp = await fetch(`${provider.endpoint}/v1/generation/${engineId}/text-to-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        text_prompts: [
          { text: opts.prompt, weight: 1 },
          ...(opts.negative_prompt ? [{ text: opts.negative_prompt, weight: -1 }] : []),
        ],
        cfg_scale: opts.cfg_scale || 7,
        width, height,
        steps: opts.steps || 30,
        seed: opts.seed || 0,
        style_preset: opts.style,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Stability API ${resp.status}: ${err.substring(0, 200)}`);
    }

    const data = await resp.json() as any;
    if (data.artifacts?.[0]?.base64) {
      const buffer = Buffer.from(data.artifacts[0].base64, 'base64');
      const outPath = path.join(OUTPUT_DIR, `stability_${Date.now()}.png`);
      fs.writeFileSync(outPath, buffer);

      return {
        success: true, provider: 'stability', model: engineId, imagePath: outPath,
        width, height, duration_ms: Date.now() - start,
        seed: data.artifacts[0].seed,
      };
    }
    throw new Error('No image returned');
  } catch (error: any) {
    return { success: false, provider: 'stability', model, width, height, duration_ms: Date.now() - start, error: error.message };
  }
}

async function generateWithOpenAI(provider: ProviderConfig, model: string, opts: GenOptions): Promise<GenResult> {
  const start = Date.now();
  const size = `${opts.width || 1024}x${opts.height || 1024}`;
  const qualityMap: Record<string, string> = { draft: 'standard', standard: 'standard', hd: 'hd' };

  try {
    const resp = await fetch(`${provider.endpoint}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: model || provider.defaultModel,
        prompt: opts.prompt,
        n: 1,
        size,
        quality: qualityMap[opts.quality || 'standard'] || 'standard',
        style: opts.style || 'vivid',
        response_format: 'b64_json',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenAI ${resp.status}: ${err.substring(0, 200)}`);
    }

    const data = await resp.json() as any;
    if (data.data?.[0]?.b64_json) {
      const buffer = Buffer.from(data.data[0].b64_json, 'base64');
      const outPath = path.join(OUTPUT_DIR, `openai_${Date.now()}.png`);
      fs.writeFileSync(outPath, buffer);

      return {
        success: true, provider: 'openai', model: model || provider.defaultModel,
        imagePath: outPath, width: opts.width || 1024, height: opts.height || 1024,
        duration_ms: Date.now() - start,
      };
    }
    throw new Error('No image returned');
  } catch (error: any) {
    return { success: false, provider: 'openai', model, width: opts.width || 1024, height: opts.height || 1024, duration_ms: Date.now() - start, error: error.message };
  }
}

async function generateWithTogether(provider: ProviderConfig, model: string, opts: GenOptions): Promise<GenResult> {
  const start = Date.now();

  try {
    const resp = await fetch(`${provider.endpoint}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: model || provider.defaultModel,
        prompt: opts.prompt,
        width: opts.width || 1024,
        height: opts.height || 1024,
        steps: opts.steps || 4,
        n: 1,
        response_format: 'b64_json',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Together AI ${resp.status}: ${err.substring(0, 200)}`);
    }

    const data = await resp.json() as any;
    if (data.data?.[0]?.b64_json) {
      const buffer = Buffer.from(data.data[0].b64_json, 'base64');
      const outPath = path.join(OUTPUT_DIR, `together_${Date.now()}.png`);
      fs.writeFileSync(outPath, buffer);

      return {
        success: true, provider: 'together', model: model || provider.defaultModel,
        imagePath: outPath, width: opts.width || 1024, height: opts.height || 1024,
        duration_ms: Date.now() - start,
      };
    }
    throw new Error('No image returned');
  } catch (error: any) {
    return { success: false, provider: 'together', model, width: opts.width || 1024, height: opts.height || 1024, duration_ms: Date.now() - start, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// Unified Generator (Auto-Routing or Manual)
// ═══════════════════════════════════════════════════════════════

const GENERATOR_MAP: Record<string, (p: ProviderConfig, m: string, o: GenOptions) => Promise<GenResult>> = {
  comfyui: generateWithComfyUI,
  automatic1111: generateWithA1111,
  stability: generateWithStability,
  openai: generateWithOpenAI,
  together: generateWithTogether,
};

async function generate(opts: GenOptions & { provider?: string; model?: string }): Promise<GenResult> {
  const preference = opts.provider || userPrefs.preferredProvider || 'auto';
  const requestedModel = opts.model || userPrefs.preferredModel;

  // If a specific provider is requested
  if (preference !== 'auto' && preference !== 'local' && preference !== 'cloud') {
    const provider = PROVIDERS[preference];
    if (!provider) {
      return { success: false, provider: preference, model: '', width: 0, height: 0, duration_ms: 0, error: `Unknown provider: ${preference}. Available: ${Object.keys(PROVIDERS).join(', ')}` };
    }
    if (!(await isProviderAvailable(provider))) {
      return { success: false, provider: preference, model: '', width: 0, height: 0, duration_ms: 0, error: `Provider ${preference} is not available. Check if the service is running or API key is set.` };
    }
    const gen = GENERATOR_MAP[preference];
    if (!gen) {
      return { success: false, provider: preference, model: '', width: 0, height: 0, duration_ms: 0, error: `No generator for ${preference}` };
    }
    return gen(provider, requestedModel || provider.defaultModel, opts);
  }

  // Auto-route: try available providers in order
  const available = await getAvailableProviders(preference);
  if (available.length === 0) {
    return {
      success: false, provider: 'none', model: '', width: 0, height: 0, duration_ms: 0,
      error: `No image generation providers available. ${preference === 'local' ? 'Start ComfyUI or Automatic1111 on the VPS.' : preference === 'cloud' ? 'Set STABILITY_API_KEY, OPENAI_API_KEY, or TOGETHER_API_KEY.' : 'Start a local SD server or set a cloud API key.'}`,
    };
  }

  // Try each provider
  const errors: string[] = [];
  for (const provider of available) {
    const providerKey = Object.entries(PROVIDERS).find(([, v]) => v === provider)?.[0];
    if (!providerKey || !GENERATOR_MAP[providerKey]) continue;
    
    const result = await GENERATOR_MAP[providerKey](provider, requestedModel || provider.defaultModel, opts);
    if (result.success) return result;
    errors.push(`${provider.name}: ${result.error}`);
  }

  return {
    success: false, provider: 'auto', model: '', width: 0, height: 0, duration_ms: 0,
    error: `All providers failed:\n${errors.join('\n')}`,
  };
}

// ═══════════════════════════════════════════════════════════════
// MCP Tool Export
// ═══════════════════════════════════════════════════════════════

export function getImageGenTools() {
  return [
    {
      schema: {
        name: 'image_generation',
        description: 'Generate images from text. Actions: generate (create image), list_providers (show available), configure (set preferences like local-only/cloud-only), list_images (recent outputs). Supports local SD and cloud APIs with manual model selection.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            action: {
              type: 'string',
              enum: ['generate', 'list_providers', 'configure', 'list_images'],
              description: 'Action to perform',
            },
            // Generate options
            prompt: { type: 'string', description: 'Text description of the image to generate' },
            negative_prompt: { type: 'string', description: 'What to avoid in the image' },
            provider: {
              type: 'string',
              description: 'Provider: "auto" (default, local first), "local" (local only), "cloud" (cloud only), or specific name: comfyui, automatic1111, stability, openai, together',
            },
            model: { type: 'string', description: 'Specific model name to use (overrides provider default)' },
            width: { type: 'number', description: 'Image width (default: 1024)' },
            height: { type: 'number', description: 'Image height (default: 1024)' },
            steps: { type: 'number', description: 'Generation steps (default: 20)' },
            cfg_scale: { type: 'number', description: 'CFG scale / guidance (default: 7)' },
            seed: { type: 'number', description: 'Random seed (for reproducibility)' },
            quality: { type: 'string', enum: ['draft', 'standard', 'hd'], description: 'Quality preset' },
            style: { type: 'string', description: 'Style preset (e.g. "photographic", "anime", "digital-art")' },
            // Configure options
            allow_local: { type: 'boolean', description: 'Enable/disable local providers' },
            allow_cloud: { type: 'boolean', description: 'Enable/disable cloud providers' },
            preferred_provider: { type: 'string', description: 'Default provider preference' },
            preferred_model: { type: 'string', description: 'Default model to use' },
          },
          required: ['action'],
        },
      },
      handler: async (args: any) => {
        try {
          switch (args.action) {
            case 'generate': {
              if (!args.prompt) {
                return { content: [{ type: 'text', text: 'Required: prompt' }], isError: true };
              }
              const result = await generate({
                prompt: args.prompt,
                negative_prompt: args.negative_prompt,
                provider: args.provider,
                model: args.model,
                width: args.width,
                height: args.height,
                steps: args.steps,
                cfg_scale: args.cfg_scale,
                seed: args.seed,
                quality: args.quality,
                style: args.style,
              });

              if (result.success) {
                return { content: [
                  { type: 'text', text: `🎨 Image generated!\n\nProvider: ${result.provider}\nModel: ${result.model}\nSize: ${result.width}x${result.height}\nTime: ${result.duration_ms}ms${result.seed ? '\nSeed: ' + result.seed : ''}\nSaved: ${result.imagePath}` },
                  ...(result.imagePath && fs.existsSync(result.imagePath) ? [{
                    type: 'image' as const,
                    data: fs.readFileSync(result.imagePath).toString('base64'),
                    mimeType: 'image/png',
                  }] : []),
                ]};
              }
              return { content: [{ type: 'text', text: `❌ Generation failed: ${result.error}` }], isError: true };
            }

            case 'list_providers': {
              const lines: string[] = ['**Image Generation Providers:**\n'];
              for (const [key, provider] of Object.entries(PROVIDERS)) {
                const available = await isProviderAvailable(provider);
                const enabled = provider.type === 'local' ? userPrefs.allowLocal : userPrefs.allowCloud;
                const status = !enabled ? '⬛ Disabled' : available ? '🟢 Available' : '🔴 Offline';
                lines.push(`${status} **${provider.name}** (\`${key}\`)`);
                lines.push(`   Type: ${provider.type} | Models: ${provider.models.join(', ')}`);
                lines.push(`   Default: ${provider.defaultModel}${provider.apiKey ? ' | API Key: ✅' : ''}`);
                lines.push('');
              }
              lines.push(`\n**Current Config:** Provider=${userPrefs.preferredProvider} | Local=${userPrefs.allowLocal ? '✅' : '❌'} | Cloud=${userPrefs.allowCloud ? '✅' : '❌'}${userPrefs.preferredModel ? ' | Model=' + userPrefs.preferredModel : ''}`);
              return { content: [{ type: 'text', text: lines.join('\n') }] };
            }

            case 'configure': {
              if (args.allow_local !== undefined) userPrefs.allowLocal = args.allow_local;
              if (args.allow_cloud !== undefined) userPrefs.allowCloud = args.allow_cloud;
              if (args.preferred_provider) userPrefs.preferredProvider = args.preferred_provider;
              if (args.preferred_model !== undefined) userPrefs.preferredModel = args.preferred_model || null;
              savePrefs();
              return { content: [{ type: 'text', text: `✅ Updated preferences:\n• Local: ${userPrefs.allowLocal ? '✅ Enabled' : '❌ Disabled'}\n• Cloud: ${userPrefs.allowCloud ? '✅ Enabled' : '❌ Disabled'}\n• Provider: ${userPrefs.preferredProvider}\n• Model: ${userPrefs.preferredModel || '(auto)'}` }] };
            }

            case 'list_images': {
              try {
                const files = fs.readdirSync(OUTPUT_DIR)
                  .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
                  .sort()
                  .slice(-20);
                if (files.length === 0) {
                  return { content: [{ type: 'text', text: 'No generated images yet.' }] };
                }
                const list = files.map(f => {
                  const stat = fs.statSync(path.join(OUTPUT_DIR, f));
                  return `• ${f} (${(stat.size / 1024).toFixed(0)}KB, ${new Date(stat.mtime).toLocaleString()})`;
                }).join('\n');
                return { content: [{ type: 'text', text: `📸 Recent images (${OUTPUT_DIR}):\n\n${list}` }] };
              } catch {
                return { content: [{ type: 'text', text: 'No images directory.' }] };
              }
            }

            default:
              return { content: [{ type: 'text', text: `Unknown action: ${args.action}` }], isError: true };
          }
        } catch (error: any) {
          return { content: [{ type: 'text', text: `Image gen error: ${error.message}` }], isError: true };
        }
      },
    },
  ];
}
