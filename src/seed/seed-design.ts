import fs from 'fs';
import path from 'path';

// ============================================================
// Internal Store
// ============================================================

export let designKnowledge: {
  palettes: any[];
  typographies: any[];
  trends: any[];
} | null = null;

// ============================================================
// Base Data Set
// ============================================================

const initialPalettes = [
  {
    id: 'modern_saas_1',
    name: 'Modern SaaS (Blue)',
    mood: 'professional',
    tags: ['corporate', 'clean', 'trust'],
    colors: {
      primary: '#2563eb', // blue-600
      secondary: '#4f4f4f',
      accent: '#f59e0b', // amber-500
      background: '#ffffff',
      surface: '#f3f4f6', // gray-100
      text_primary: '#111827', // gray-900
      text_secondary: '#4b5563', // gray-600
      destructive: '#ef4444',
      success: '#10b981',
      dark_mode: {
        background: '#0f172a', // slate-900
        surface: '#1e293b', // slate-800
        text_primary: '#f8fafc', // slate-50
        text_secondary: '#94a3b8' // slate-400
      }
    }
  },
  {
    id: 'playful_brand',
    name: 'Playful Startup',
    mood: 'playful',
    tags: ['startup', 'warm', 'friendly'],
    colors: {
      primary: '#ec4899', // pink-500
      secondary: '#8b5cf6', // violet-500
      accent: '#fbbf24', // amber-400
      background: '#fffdfa',
      surface: '#fdf2f8', // pink-50
      text_primary: '#1f2937', 
      text_secondary: '#6b7280',
      destructive: '#ef4444',
      success: '#10b981',
      dark_mode: {
        background: '#171717',
        surface: '#262626',
        text_primary: '#f9fafb',
        text_secondary: '#a1a1aa'
      }
    }
  },
  {
    id: 'luxury_dark',
    name: 'Luxury Dark Mode',
    mood: 'luxury',
    tags: ['premium', 'dark', 'gold'],
    colors: {
      primary: '#d4af37', // metallic gold
      secondary: '#e5e7eb', // gray-200
      accent: '#fcd34d',
      background: '#0a0a0a',
      surface: '#171717',
      text_primary: '#fafafa',
      text_secondary: '#a3a3a3',
      destructive: '#ef4444',
      success: '#10b981',
      light_mode_counterpart: {
        background: '#ffffff',
        surface: '#f3f4f6',
        text_primary: '#171717',
        text_secondary: '#525252'
      }
    }
  },
  {
    id: 'eco_green',
    name: 'Eco Nature',
    mood: 'organic',
    tags: ['nature', 'medical', 'calm'],
    colors: {
      primary: '#059669', // emerald-600
      secondary: '#047857', // emerald-700
      accent: '#84cc16', // lime-500
      background: '#f8fafc',
      surface: '#ecfdf5', // emerald-50
      text_primary: '#064e3b', // emerald-900
      text_secondary: '#065f46', // emerald-800
      destructive: '#dc2626',
      success: '#10b981',
      dark_mode: {
        background: '#022c22', // emerald-950
        surface: '#064e3b', // emerald-900
        text_primary: '#ecfdf5',
        text_secondary: '#a7f3d0'
      }
    }
  }
];

const initialTypographies = [
  {
    id: 'sans-modern',
    name: 'Modern Sans-Serif',
    style: 'modern_saas',
    headings: 'Inter',
    body: 'Inter',
    scale: 'perfect_fourth',
    base_size: '16px',
    metrics: {
      h1: { size: '2.369rem', weight: '700', line_height: '1.2' },
      h2: { size: '1.777rem', weight: '600', line_height: '1.3' },
      h3: { size: '1.333rem', weight: '600', line_height: '1.4' },
      p:  { size: '1rem', weight: '400', line_height: '1.6' }
    }
  },
  {
    id: 'serif-elegant',
    name: 'Elegant Serif',
    style: 'luxury',
    headings: 'Playfair Display',
    body: 'Lora',
    scale: 'golden_ratio',
    base_size: '18px',
    metrics: {
      h1: { size: '2.618rem', weight: '700', line_height: '1.1' },
      h2: { size: '1.618rem', weight: '600', line_height: '1.2' },
      h3: { size: '1rem', weight: '600', line_height: '1.3' },
      p:  { size: '1rem', weight: '400', line_height: '1.7' }
    }
  },
  {
    id: 'mono-tech',
    name: 'Tech Monospace',
    style: 'developer',
    headings: 'Space Grotesk',
    body: 'JetBrains Mono',
    scale: 'major_third',
    base_size: '16px',
    metrics: {
      h1: { size: '2.441rem', weight: '700', line_height: '1.2' },
      h2: { size: '1.953rem', weight: '600', line_height: '1.2' },
      h3: { size: '1.563rem', weight: '600', line_height: '1.3' },
      p:  { size: '1rem', weight: '400', line_height: '1.6' }
    }
  }
];

const initialTrends = [
  { name: 'Bento Grid', description: 'Modular, card-based layouts tightly packed', category: 'layout', timeframe: '2024-2025' },
  { name: 'Glassmorphism', description: 'Frosted glass effects with background-blur', category: 'style', timeframe: 'Trending' },
  { name: 'Aurora / Mesh Gradients', description: 'Smooth, blurred mesh gradients combining 3-4 vivid colors', category: 'background', timeframe: 'Trending' },
  { name: 'Neobrutalism', description: 'High contrast, bold typography, hard shadows', category: 'style', timeframe: 'Fading Out' },
  { name: 'Micro-interactions', description: 'Subtle physics-based animations upon interaction', category: 'animation', timeframe: 'Evergreen' },
  { name: 'Skeuomorph Returns', description: 'Embossed edges and subtle 3D lighting making a comeback', category: 'style', timeframe: 'Rising' }
];

// ============================================================
// Initialization & Access
// ============================================================

export function loadDesignKnowledgeSync() {
  if (designKnowledge) return designKnowledge;

  // In a real database we would load from UsefulCode/DesignKnowledge. 
  // For immediate availability we seed the internal store:
  designKnowledge = {
    palettes: initialPalettes,
    typographies: initialTypographies,
    trends: initialTrends
  };

  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  const dir = path.join(workspaceRoot, 'UsefulCode', 'DesignKnowledge');
  
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Auto-dump to disk so humans can edit
    const pPath = path.join(dir, 'palettes.json');
    if (!fs.existsSync(pPath)) fs.writeFileSync(pPath, JSON.stringify(initialPalettes, null, 2), 'utf-8');
    else designKnowledge.palettes = JSON.parse(fs.readFileSync(pPath, 'utf-8'));

    const tPath = path.join(dir, 'typographies.json');
    if (!fs.existsSync(tPath)) fs.writeFileSync(tPath, JSON.stringify(initialTypographies, null, 2), 'utf-8');
    else designKnowledge.typographies = JSON.parse(fs.readFileSync(tPath, 'utf-8'));

    const trPath = path.join(dir, 'trends.json');
    if (!fs.existsSync(trPath)) fs.writeFileSync(trPath, JSON.stringify(initialTrends, null, 2), 'utf-8');
    else designKnowledge.trends = JSON.parse(fs.readFileSync(trPath, 'utf-8'));

  } catch (err) {
    console.error('[VegaMCP] Failed to seed DesignKnowledge:', err);
  }

  return designKnowledge;
}

export function searchPalettes(query?: string, mood?: string) {
  const db = loadDesignKnowledgeSync();
  let hits = db.palettes;
  if (mood) hits = hits.filter(p => p.mood === mood);
  if (query) {
    const q = query.toLowerCase();
    hits = hits.filter(p => p.name.toLowerCase().includes(q) || p.tags.some((t: string) => t.includes(q)));
  }
  return hits;
}

export function searchTypographies(query?: string, style?: string) {
  const db = loadDesignKnowledgeSync();
  let hits = db.typographies;
  if (style) hits = hits.filter(p => p.style === style);
  if (query) {
    const q = query.toLowerCase();
    hits = hits.filter(p => p.name.toLowerCase().includes(q) || p.headings.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
  }
  return hits;
}

export function getTrends() {
  return loadDesignKnowledgeSync().trends;
}
