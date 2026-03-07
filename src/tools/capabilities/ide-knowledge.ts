/**
 * The Claw — IDE Knowledge Base v2.0
 * 
 * Highly compressed through template inheritance.
 * Extends base IDE layouts (e.g., VS Code) to minimize duplication.
 */

export interface IdeKnowledge {
  id: string;
  name: string;
  base_ide?: string; // e.g., 'vscode'
  
  // ── AI Chat Panel (Specific to each IDE) ──
  chat_panel?: {
    location: string;
    open_shortcut_win?: string;
    open_shortcut_mac?: string;
    submit_key: string;
  };

  // ── Model Selector ──
  model_selector?: {
    location: string;
    open_shortcut_win?: string;
    open_shortcut_mac?: string;
    open_method: string;
    select_method: string;
  };

  // ── Mode/Agent Selector ──
  mode_selector?: {
    location: string;
    modes: string[];
  };

  // ── System Panels (Inherited from base_ide if omitted) ──
  file_explorer?: {
    open_shortcut_win: string;
    open_shortcut_mac: string;
    quick_open_win: string;
    quick_open_mac: string;
  };

  terminal?: {
    toggle_shortcut_win: string;
    toggle_shortcut_mac: string;
    new_terminal_win: string;
    new_terminal_mac: string;
  };

  settings?: {
    open_shortcut_win: string;
    open_shortcut_mac: string;
    command_palette_win: string;
    command_palette_mac: string;
  };

  // ── Visual Landmarks ──
  visual_landmarks: {
    name: string;
    description: string;
    typical_position: string;
  }[];

  // ── Important Keyboard Shortcuts overrides ──
  shortcuts: {
    action: string;
    win: string;
    mac: string;
  }[];

  cua_notes: string[];
}

// ═══════════════════════════════════════════════════════════════
// BASE TEMPLATES
// ═══════════════════════════════════════════════════════════════

const VSCODE_BASE: Partial<IdeKnowledge> = {
  file_explorer: {
    open_shortcut_win: 'Ctrl+Shift+E',
    open_shortcut_mac: 'Cmd+Shift+E',
    quick_open_win: 'Ctrl+P',
    quick_open_mac: 'Cmd+P',
  },
  terminal: {
    toggle_shortcut_win: 'Ctrl+`',
    toggle_shortcut_mac: 'Cmd+`',
    new_terminal_win: 'Ctrl+Shift+`',
    new_terminal_mac: 'Cmd+Shift+`',
  },
  settings: {
    open_shortcut_win: 'Ctrl+,',
    open_shortcut_mac: 'Cmd+,',
    command_palette_win: 'Ctrl+Shift+P',
    command_palette_mac: 'Cmd+Shift+P',
  },
  shortcuts: [
    { action: 'Toggle Sidebar', win: 'Ctrl+B', mac: 'Cmd+B' },
    { action: 'Toggle Panel', win: 'Ctrl+J', mac: 'Cmd+J' },
    { action: 'Close Tab', win: 'Ctrl+W', mac: 'Cmd+W' },
  ],
};

// ═══════════════════════════════════════════════════════════════
// SPECIFIC IDE PROFILES (Overrides)
// ═══════════════════════════════════════════════════════════════

const IDE_PROFILES: Record<string, Partial<IdeKnowledge>> = {
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    base_ide: 'vscode',
    chat_panel: {
      location: 'Right sidebar',
      open_shortcut_win: 'Ctrl+L',
      open_shortcut_mac: 'Cmd+L',
      submit_key: 'Enter',
    },
    model_selector: {
      location: 'Bottom-left of chat input',
      open_shortcut_win: 'Ctrl+/',
      open_shortcut_mac: 'Cmd+/',
      open_method: 'Click model name button or use shortcut',
      select_method: 'Type to search, Arrow keys + Enter',
    },
    mode_selector: {
      location: 'Top of chat panel',
      modes: ['Agent', 'Ask', 'Manual'],
    },
    visual_landmarks: [
      { name: 'chat_input', description: 'Message input box at bottom', typical_position: 'bottom-center' },
      { name: 'model_dropdown', description: 'Model name button', typical_position: 'bottom-left' },
      { name: 'send_button', description: 'Send arrow icon', typical_position: 'bottom-right' },
    ],
    shortcuts: [
      { action: 'Inline Edit', win: 'Ctrl+K', mac: 'Cmd+K' },
      { action: 'Open Composer', win: 'Ctrl+I', mac: 'Cmd+I' },
      { action: 'Accept AI Code', win: 'Ctrl+Enter', mac: 'Cmd+Enter' },
    ],
    cua_notes: [
      'Model selector must be opened with Ctrl+/ to type the name filter.',
      'Cursor has Composer (Ctrl+I) which is separate from the main chat (Ctrl+L).',
    ],
  },

  windsurf: {
    id: 'windsurf',
    name: 'Windsurf (Cascade)',
    base_ide: 'vscode',
    chat_panel: {
      location: 'Right sidebar (Cascade)',
      open_shortcut_win: 'Ctrl+L',
      open_shortcut_mac: 'Cmd+L',
      submit_key: 'Enter',
    },
    model_selector: {
      location: 'BELOW the text input box',
      open_method: 'Click model chip below input',
      select_method: 'Click desired model',
    },
    mode_selector: {
      location: 'Top center toggle',
      modes: ['Code', 'Chat'],
    },
    visual_landmarks: [
      { name: 'cascade_input', description: 'Message input box', typical_position: 'bottom-center' },
      { name: 'model_selector', description: 'Model chip BELOW input', typical_position: 'below-input' },
    ],
    shortcuts: [
      { action: 'Inline Edit', win: 'Ctrl+I', mac: 'Cmd+I' },
    ],
    cua_notes: [
      'CRITICAL: Model selector is BELOW the chat input, not inside or above it.',
      'Code Mode enables agentic editing. Chat Mode is read-only.',
    ],
  },

  vscode: {
    id: 'vscode',
    name: 'VS Code (Copilot)',
    base_ide: 'vscode',
    chat_panel: {
      location: 'Secondary sidebar or standard panel',
      open_shortcut_win: 'Ctrl+Alt+I',
      open_shortcut_mac: 'Ctrl+Cmd+I',
      submit_key: 'Enter',
    },
    model_selector: {
      location: 'Pill inside chat input area',
      open_method: 'Click pill inside input box',
      select_method: 'Click model in dropdown',
    },
    mode_selector: {
      location: 'Agent dropdown at top',
      modes: ['Agent', 'Plan', 'Ask'],
    },
    visual_landmarks: [
      { name: 'chat_input', description: 'Text area with "Ask Copilot"', typical_position: 'bottom-center' },
      { name: 'model_selector', description: 'Model pill inside input', typical_position: 'bottom-left' },
    ],
    shortcuts: [
      { action: 'Inline Chat', win: 'Ctrl+I', mac: 'Cmd+I' },
    ],
    cua_notes: [
      'Model selector is inside the text input box.',
      'Agent mode is a separate dropdown at the top of the panel.',
    ],
  },

  cline: {
    id: 'cline',
    name: 'Cline (VS Code)',
    base_ide: 'vscode',
    chat_panel: {
      location: 'Sidebar webview',
      open_shortcut_win: 'Ctrl+Shift+P -> Cline: Open',
      open_shortcut_mac: 'Cmd+Shift+P -> Cline: Open',
      submit_key: 'Enter',
    },
    model_selector: {
      location: 'Extension Settings (Gear icon)',
      open_method: 'Click gear icon at top right -> Select API Provider -> Select Model',
      select_method: 'Dropdown selection + Save',
    },
    visual_landmarks: [
      { name: 'chat_input', description: 'Input area at bottom', typical_position: 'bottom-center' },
      { name: 'settings_gear', description: 'Gear icon top-right', typical_position: 'top-right' },
      { name: 'approve_button', description: 'Tool approval buttons', typical_position: 'in-conversation' },
    ],
    shortcuts: [],
    cua_notes: [
      'Model cannot be verified visually from the main chat. You must open settings via the gear icon.',
    ],
  },
};

/**
 * Advanced inheritance-based knowledge retrieval.
 * Merges the specific IDE profile with its base template.
 */
export function getIdeKnowledge(ideType: string): IdeKnowledge {
  const normalized = ideType.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  let profileKey = 'vscode'; // generic fallback
  if (normalized.includes('cursor')) profileKey = 'cursor';
  else if (normalized.includes('windsurf') || normalized.includes('codeium') || normalized.includes('cascade')) profileKey = 'windsurf';
  else if (normalized.includes('cline') || normalized.includes('roo')) profileKey = 'cline';

  const profile = IDE_PROFILES[profileKey];
  
  // Merge with base if specified
  let merged: any = { ...profile };
  
  if (profile.base_ide === 'vscode') {
    merged.file_explorer = { ...VSCODE_BASE.file_explorer, ...profile.file_explorer };
    merged.terminal = { ...VSCODE_BASE.terminal, ...profile.terminal };
    merged.settings = { ...VSCODE_BASE.settings, ...profile.settings };
    
    // Merge array shortcuts
    const baseShortcuts = VSCODE_BASE.shortcuts || [];
    const profileShortcuts = profile.shortcuts || [];
    merged.shortcuts = [...baseShortcuts, ...profileShortcuts];
  }

  // Ensure arrays initialize if undefined
  merged.visual_landmarks = merged.visual_landmarks || [];
  merged.cua_notes = merged.cua_notes || [];

  return merged as IdeKnowledge;
}
