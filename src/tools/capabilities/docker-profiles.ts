/**
 * VegaMCP — Docker Profile Manager (v1.0)
 * 
 * Self-contained Dockerfiles and profile definitions that the sandbox
 * can auto-generate and build. Each profile is a purpose-built container
 * with pre-installed tooling for specific testing/development workflows.
 * 
 * The MCP can:
 *   1. List available profiles
 *   2. Auto-generate Dockerfiles for any profile
 *   3. Build profile images on demand
 *   4. Create sandboxes from profiles
 *   5. Start Docker Desktop automatically (Windows/macOS)
 */

import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

// ============================================================
// Profile Registry
// ============================================================

export interface DockerProfileDefinition {
  id: string;
  name: string;
  description: string;
  /** Categories this profile covers */
  categories: string[];
  /** Base Docker image */
  baseImage: string;
  /** System packages (apt-get) */
  aptPackages: string[];
  /** Python packages */
  pipPackages: string[];
  /** Node.js global packages */
  npmPackages: string[];
  /** Extra Dockerfile commands */
  extraCommands: string[];
  /** Exposed ports */
  exposedPorts: number[];
  /** Environment variables */
  envVars: Record<string, string>;
  /** Container resource limits */
  resources: { cpus: string; memory: string };
  /** Whether network access is required */
  needsNetwork: boolean;
  /** Pre-installed testing tools from VegaMCP that map to this profile */
  mappedTools: string[];
}

const PROFILES: Map<string, DockerProfileDefinition> = new Map();

// ────────────────────────────────────────────────────────────
// 1. WEB DEVELOPMENT
// ────────────────────────────────────────────────────────────
PROFILES.set('webdev', {
  id: 'webdev',
  name: 'Web Development',
  description: 'Full-stack web development environment with Node.js, React/Vue/Svelte dev tools, hot reload, and browser testing via Playwright.',
  categories: ['web', 'frontend', 'fullstack'],
  baseImage: 'node:20-bookworm-slim',
  aptPackages: [
    'git', 'curl', 'wget', 'build-essential', 'python3', 'python3-pip',
    'chromium', 'firefox-esr', 'libnss3', 'libatk-bridge2.0-0', 'libdrm2',
    'libxkbcommon0', 'libgbm1', 'libgtk-3-0', 'libxss1', 'libasound2',
  ],
  pipPackages: [],
  npmPackages: [
    'typescript', 'vite', 'eslint', 'prettier', 'serve', 'concurrently',
    'playwright', 'lighthouse',
  ],
  extraCommands: [
    'RUN npx playwright install --with-deps chromium',
    'RUN mkdir -p /app && chmod 777 /app',
  ],
  exposedPorts: [3000, 4173, 5173, 8080, 8000],
  envVars: { NODE_ENV: 'development', PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright' },
  resources: { cpus: '4.0', memory: '4g' },
  needsNetwork: true,
  mappedTools: ['web_testing', 'accessibility', 'visual_testing', 'performance_toolkit', 'seo_toolkit'],
});

// ────────────────────────────────────────────────────────────
// 2. API DEVELOPMENT & TESTING
// ────────────────────────────────────────────────────────────
PROFILES.set('api-dev', {
  id: 'api-dev',
  name: 'API Development & Testing',
  description: 'Backend API development with Node.js + Python, database clients, load testing tools, and API contract validation.',
  categories: ['api', 'backend', 'microservices'],
  baseImage: 'node:20-bookworm-slim',
  aptPackages: [
    'git', 'curl', 'wget', 'jq', 'python3', 'python3-pip', 'python3-venv',
    'postgresql-client', 'redis-tools', 'sqlite3', 'httpie',
  ],
  pipPackages: [
    'fastapi', 'uvicorn', 'flask', 'requests', 'httpx', 'pydantic',
    'sqlalchemy', 'alembic', 'pytest', 'locust',
  ],
  npmPackages: [
    'typescript', 'ts-node', 'express', 'fastify', 'supertest', 'autocannon',
    'openapi-typescript', 'zod', 'prisma',
  ],
  extraCommands: [
    'RUN mkdir -p /app && chmod 777 /app',
  ],
  exposedPorts: [3000, 5000, 8000, 8080, 5432, 6379],
  envVars: { NODE_ENV: 'development', PYTHONUNBUFFERED: '1' },
  resources: { cpus: '2.0', memory: '2g' },
  needsNetwork: true,
  mappedTools: ['api_testing', 'server_testing', 'database_testing', 'security_testing'],
});

// ────────────────────────────────────────────────────────────
// 3. MOBILE APP DEVELOPMENT
// ────────────────────────────────────────────────────────────
PROFILES.set('mobile-dev', {
  id: 'mobile-dev',
  name: 'Mobile App Development',
  description: 'React Native / Flutter / Expo development with Android SDK, ADB, and build tools.',
  categories: ['mobile', 'android', 'react-native', 'flutter'],
  baseImage: 'node:20-bookworm',
  aptPackages: [
    'git', 'curl', 'wget', 'unzip', 'openjdk-17-jdk-headless',
    'build-essential', 'python3', 'ruby', 'ruby-dev', 'watchman',
  ],
  pipPackages: [],
  npmPackages: [
    'react-native-cli', 'expo-cli', 'eas-cli', 'typescript',
  ],
  extraCommands: [
    'ENV ANDROID_HOME=/opt/android-sdk',
    'ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools',
    'RUN mkdir -p $ANDROID_HOME && cd /tmp && \\',
    '    curl -sL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o tools.zip && \\',
    '    unzip -q tools.zip -d $ANDROID_HOME/cmdline-tools && \\',
    '    mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest && \\',
    '    rm tools.zip',
    'RUN yes | sdkmanager --licenses > /dev/null 2>&1 || true',
    'RUN sdkmanager "platform-tools" "build-tools;34.0.0" "platforms;android-34" || true',
    'RUN mkdir -p /app && chmod 777 /app',
  ],
  exposedPorts: [8081, 19000, 19001, 19002],
  envVars: { JAVA_HOME: '/usr/lib/jvm/java-17-openjdk-amd64' },
  resources: { cpus: '4.0', memory: '6g' },
  needsNetwork: true,
  mappedTools: ['mobile_testing', 'visual_testing'],
});

// ────────────────────────────────────────────────────────────
// 4. SECURITY TESTING
// ────────────────────────────────────────────────────────────
PROFILES.set('security', {
  id: 'security',
  name: 'Security Testing',
  description: 'Application security scanning with DAST, SAST, secret detection, dependency auditing, and SSL inspection.',
  categories: ['security', 'pentesting', 'compliance'],
  baseImage: 'python:3.12-slim-bookworm',
  aptPackages: [
    'git', 'curl', 'wget', 'openssl', 'nss-plugin-pem', 'ca-certificates',
    'dnsutils', 'net-tools', 'procps',
  ],
  pipPackages: [
    'bandit', 'safety', 'detect-secrets', 'semgrep', 'pip-audit',
    'cryptography', 'certifi', 'requests',
  ],
  npmPackages: [
    'snyk', 'retire', 'npm-audit-html',
  ],
  extraCommands: [
    'RUN mkdir -p /app /scan-results && chmod 777 /app /scan-results',
  ],
  exposedPorts: [],
  envVars: {},
  resources: { cpus: '2.0', memory: '2g' },
  needsNetwork: true,
  mappedTools: ['security_testing', 'security_toolkit'],
});

// ────────────────────────────────────────────────────────────
// 5. DATA SCIENCE / ML
// ────────────────────────────────────────────────────────────
PROFILES.set('data-science', {
  id: 'data-science',
  name: 'Data Science & ML',
  description: 'Python data science environment with Jupyter, pandas, scikit-learn, TensorFlow/PyTorch, and visualization tools.',
  categories: ['data', 'ml', 'ai', 'jupyter'],
  baseImage: 'python:3.12-bookworm',
  aptPackages: [
    'git', 'curl', 'build-essential', 'libhdf5-dev', 'liblapack-dev',
    'libopenblas-dev', 'graphviz', 'ffmpeg',
  ],
  pipPackages: [
    'jupyter', 'jupyterlab', 'notebook', 'numpy', 'pandas', 'scipy',
    'scikit-learn', 'matplotlib', 'seaborn', 'plotly',
    'torch', 'torchvision', 'transformers', 'datasets',
    'opencv-python-headless', 'pillow', 'requests', 'httpx',
  ],
  npmPackages: [],
  extraCommands: [
    'RUN mkdir -p /notebooks /data && chmod 777 /notebooks /data',
  ],
  exposedPorts: [8888, 8889],
  envVars: { PYTHONUNBUFFERED: '1', JUPYTER_TOKEN: 'vegamcp' },
  resources: { cpus: '4.0', memory: '8g' },
  needsNetwork: true,
  mappedTools: ['database_testing', 'performance_toolkit'],
});

// ────────────────────────────────────────────────────────────
// 6. DESKTOP APP DEVELOPMENT
// ────────────────────────────────────────────────────────────
PROFILES.set('desktop-dev', {
  id: 'desktop-dev',
  name: 'Desktop App Development',
  description: 'Electron / Tauri development with virtual display (Xvfb), GUI automation, and cross-platform build tools.',
  categories: ['desktop', 'electron', 'tauri', 'gui'],
  baseImage: 'node:20-bookworm',
  aptPackages: [
    'git', 'curl', 'wget', 'build-essential', 'python3',
    'xvfb', 'x11-utils', 'libgtk-3-0', 'libnotify-dev', 'libnss3',
    'libxss1', 'libasound2', 'libatspi2.0-0', 'libdrm2', 'libgbm1',
    'libnspr4', 'libsecret-1-0', 'libxkbfile1', 'xdg-utils', 'openbox',
    'imagemagick', 'scrot', 'xdotool', 'xclip', 'wmctrl',
    'libwebkit2gtk-4.1-dev', 'libssl-dev', 'libayatana-appindicator3-dev',
    'librsvg2-dev', 'patchelf',
  ],
  pipPackages: ['pyautogui', 'pillow', 'opencv-python-headless'],
  npmPackages: [
    'electron', 'electron-builder', 'typescript', '@electron/rebuild',
  ],
  extraCommands: [
    'ENV DISPLAY=:99',
    'RUN echo "#!/bin/bash\\nXvfb :99 -screen 0 1920x1080x24 &\\nexec \\"\\$@\\"" > /entrypoint.sh && chmod +x /entrypoint.sh',
    'RUN mkdir -p /app && chmod 777 /app',
    'ENTRYPOINT ["/entrypoint.sh"]',
  ],
  exposedPorts: [3000, 5173],
  envVars: { DISPLAY: ':99', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', DONT_PROMPT_WSL_INSTALL: '1' },
  resources: { cpus: '4.0', memory: '4g' },
  needsNetwork: true,
  mappedTools: ['desktop_testing', 'visual_testing'],
});

// ────────────────────────────────────────────────────────────
// 7. DATABASE TESTING
// ────────────────────────────────────────────────────────────
PROFILES.set('database', {
  id: 'database',
  name: 'Database Testing',
  description: 'Multi-database environment with PostgreSQL, MySQL, SQLite, Redis, and migration/profiling tools.',
  categories: ['database', 'sql', 'nosql'],
  baseImage: 'node:20-bookworm-slim',
  aptPackages: [
    'git', 'curl', 'postgresql', 'postgresql-client',
    'sqlite3', 'redis-server', 'python3', 'python3-pip',
  ],
  pipPackages: [
    'sqlalchemy', 'alembic', 'psycopg2-binary', 'pymysql', 'redis',
    'pytest', 'faker',
  ],
  npmPackages: [
    'prisma', 'knex', 'typeorm', 'sequelize', 'better-sqlite3',
  ],
  extraCommands: [
    'RUN mkdir -p /data /app && chmod 777 /data /app',
  ],
  exposedPorts: [5432, 3306, 6379],
  envVars: { PGDATA: '/data/pg' },
  resources: { cpus: '2.0', memory: '2g' },
  needsNetwork: false,
  mappedTools: ['database_testing'],
});

// ────────────────────────────────────────────────────────────
// 8. CI/CD & DEVOPS
// ────────────────────────────────────────────────────────────
PROFILES.set('devops', {
  id: 'devops',
  name: 'CI/CD & DevOps',
  description: 'Pipeline simulation with Docker-in-Docker, Terraform, K8s tools (kubectl/helm), and CI linting.',
  categories: ['devops', 'cicd', 'infrastructure', 'kubernetes'],
  baseImage: 'docker:24-dind',
  aptPackages: [],  // Alpine-based
  pipPackages: [],
  npmPackages: [],
  extraCommands: [
    'RUN apk add --no-cache bash curl git jq python3 py3-pip nodejs npm openssh-client',
    'RUN pip3 install --break-system-packages ansible-lint yamllint checkov',
    'RUN npm install -g actionlint-shellcheck',
    '# kubectl + helm',
    'RUN curl -sL https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl',
    'RUN curl -sL https://get.helm.sh/helm-v3.15.0-linux-amd64.tar.gz | tar xz -C /tmp && mv /tmp/linux-amd64/helm /usr/local/bin/helm',
    '# Terraform',
    'RUN curl -sL https://releases.hashicorp.com/terraform/1.8.0/terraform_1.8.0_linux_amd64.zip -o /tmp/tf.zip && unzip -q /tmp/tf.zip -d /usr/local/bin && rm /tmp/tf.zip',
    'RUN mkdir -p /workspace && chmod 777 /workspace',
  ],
  exposedPorts: [],
  envVars: {},
  resources: { cpus: '2.0', memory: '4g' },
  needsNetwork: true,
  mappedTools: ['devops_toolkit', 'server_testing'],
});

// ────────────────────────────────────────────────────────────
// 9. PERFORMANCE & LOAD TESTING
// ────────────────────────────────────────────────────────────
PROFILES.set('performance', {
  id: 'performance',
  name: 'Performance & Load Testing',
  description: 'Load testing and benchmarking with k6, autocannon, wrk, and system profiling tools.',
  categories: ['performance', 'load-testing', 'benchmarking'],
  baseImage: 'node:20-bookworm-slim',
  aptPackages: [
    'git', 'curl', 'wget', 'python3', 'python3-pip', 'wrk', 'siege',
    'procps', 'sysstat', 'htop', 'iotop', 'strace',
  ],
  pipPackages: ['locust', 'psutil', 'matplotlib'],
  npmPackages: ['autocannon', 'clinic', 'artillery'],
  extraCommands: [
    '# k6 load testing',
    'RUN curl -sL https://github.com/grafana/k6/releases/download/v0.50.0/k6-v0.50.0-linux-amd64.tar.gz | tar xz -C /tmp && mv /tmp/k6-v0.50.0-linux-amd64/k6 /usr/local/bin/k6',
    'RUN mkdir -p /app /results && chmod 777 /app /results',
  ],
  exposedPorts: [8089],  // Locust web UI
  envVars: {},
  resources: { cpus: '4.0', memory: '4g' },
  needsNetwork: true,
  mappedTools: ['advanced_testing', 'server_testing', 'performance_toolkit'],
});

// ────────────────────────────────────────────────────────────
// 10. FULL QA (everything)
// ────────────────────────────────────────────────────────────
PROFILES.set('full-qa', {
  id: 'full-qa',
  name: 'Full QA Suite',
  description: 'Complete quality assurance environment combining web, API, accessibility, visual, security, and performance testing.',
  categories: ['qa', 'testing', 'full-suite'],
  baseImage: 'node:20-bookworm',
  aptPackages: [
    'git', 'curl', 'wget', 'jq', 'build-essential',
    'python3', 'python3-pip', 'python3-venv',
    'chromium', 'firefox-esr', 'libnss3', 'libatk-bridge2.0-0', 'libdrm2',
    'libxkbcommon0', 'libgbm1', 'libgtk-3-0', 'libxss1', 'libasound2',
    'xvfb', 'x11-utils', 'imagemagick', 'scrot',
    'openssl', 'dnsutils', 'net-tools', 'sqlite3', 'postgresql-client',
    'procps', 'htop',
  ],
  pipPackages: [
    'playwright', 'requests', 'httpx', 'locust', 'bandit', 'safety',
    'detect-secrets', 'pillow', 'opencv-python-headless', 'psutil',
  ],
  npmPackages: [
    'typescript', 'playwright', 'lighthouse', 'autocannon', 'supertest',
    'eslint', 'prettier', 'serve',
  ],
  extraCommands: [
    'ENV DISPLAY=:99',
    'RUN npx playwright install --with-deps chromium firefox',
    'RUN echo "#!/bin/bash\\nXvfb :99 -screen 0 1920x1080x24 &\\nexec \\"\\$@\\"" > /entrypoint.sh && chmod +x /entrypoint.sh',
    'RUN mkdir -p /app /results && chmod 777 /app /results',
    'ENTRYPOINT ["/entrypoint.sh"]',
  ],
  exposedPorts: [3000, 8080, 9222],
  envVars: { DISPLAY: ':99', NODE_ENV: 'test', DONT_PROMPT_WSL_INSTALL: '1' },
  resources: { cpus: '4.0', memory: '6g' },
  needsNetwork: true,
  mappedTools: [
    'web_testing', 'api_testing', 'accessibility', 'visual_testing',
    'security_testing', 'server_testing', 'database_testing',
    'advanced_testing', 'performance_toolkit',
  ],
});

// ────────────────────────────────────────────────────────────
// 11. VS CODE & EXTENSION TESTING
// ────────────────────────────────────────────────────────────
PROFILES.set('vscode-test', {
  id: 'vscode-test',
  name: 'VS Code Extension Testing',
  description: 'Headless VS Code environment with Xvfb, Xdotool, and dependencies for testing IDE extensions and UI automation.',
  categories: ['vscode', 'extension', 'automation', 'desktop'],
  baseImage: 'node:20-bookworm',
  aptPackages: [
    'git', 'curl', 'wget', 'build-essential', 'python3', 'python3-pip',
    'xvfb', 'x11-utils', 'libgtk-3-0', 'libnotify-dev', 'libnss3',
    'libxss1', 'libasound2', 'libatspi2.0-0', 'libdrm2', 'libgbm1',
    'libnspr4', 'libsecret-1-0', 'libxkbfile1', 'xdg-utils', 'openbox',
    'imagemagick', 'scrot', 'xdotool', 'xclip', 'wmctrl',
    'libwebkit2gtk-4.1-dev', 'libssl-dev', 'libayatana-appindicator3-dev',
    'librsvg2-dev', 'patchelf'
  ],
  pipPackages: ['pyautogui', 'pillow', 'opencv-python-headless'],
  npmPackages: [
    'typescript', '@vscode/vsce', 'yo', 'generator-code'
  ],
  extraCommands: [
    'ENV DISPLAY=:99',
    'ENV DONT_PROMPT_WSL_INSTALL=1',
    'ENV ELECTRON_NO_ASAR=1',
    'RUN curl -fsSL -o /tmp/vscode.deb "https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64"',
    'RUN dpkg -i /tmp/vscode.deb || apt-get install -f -y',
    'RUN rm -f /tmp/vscode.deb',
    'RUN npx playwright install --with-deps chromium firefox',
    'RUN echo "#!/bin/bash\\nXvfb :99 -screen 0 1920x1080x24 &\\nexec \\"\\$@\\"" > /entrypoint.sh && chmod +x /entrypoint.sh',
    'RUN mkdir -p /app /results && chmod 777 /app /results',
    'ENTRYPOINT ["/entrypoint.sh"]',
  ],
  exposedPorts: [3000, 9222],
  envVars: { DISPLAY: ':99', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  resources: { cpus: '4.0', memory: '6g' },
  needsNetwork: true,
  mappedTools: ['desktop_testing', 'visual_testing', 'vscode_automation'],
});

// ============================================================
// Dockerfile Generator
// ============================================================

export function generateProfileDockerfile(profileId: string): string | null {
  const profile = PROFILES.get(profileId);
  if (!profile) return null;

  const lines: string[] = [
    `# ====================================================`,
    `# VegaMCP Docker Profile: ${profile.name}`,
    `# ${profile.description}`,
    `# Auto-generated by VegaMCP Sandbox Manager`,
    `# ====================================================`,
    `FROM ${profile.baseImage}`,
    '',
    '# Bypass WSL detection for Electron apps in Docker Desktop (Windows)',
    'ENV DONT_PROMPT_WSL_INSTALL=1',
    'ENV DEBIAN_FRONTEND=noninteractive',
    '',
    '# Labels',
    `LABEL maintainer="VegaMCP"`,
    `LABEL profile="${profile.id}"`,
    `LABEL description="${profile.description}"`,
    '',
  ];

  // System packages
  if (profile.aptPackages.length > 0) {
    const isAlpine = profile.baseImage.includes('alpine') || profile.baseImage.includes('dind');
    if (!isAlpine) {
      lines.push('# System packages');
      lines.push('RUN apt-get update -qq && \\');
      lines.push('    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \\');
      lines.push(`    ${profile.aptPackages.join(' \\\n    ')} && \\`);
      lines.push('    apt-get clean && rm -rf /var/lib/apt/lists/*');
      lines.push('');
    }
  }

  // Python packages
  if (profile.pipPackages.length > 0) {
    lines.push('# Python packages');
    lines.push(`RUN pip3 install --no-cache-dir --break-system-packages ${profile.pipPackages.join(' ')}`);
    lines.push('');
  }

  // Node packages
  if (profile.npmPackages.length > 0) {
    lines.push('# Node.js packages');
    lines.push(`RUN npm install -g ${profile.npmPackages.join(' ')}`);
    lines.push('');
  }

  // Extra commands
  if (profile.extraCommands.length > 0) {
    lines.push('# Profile-specific setup');
    for (const cmd of profile.extraCommands) {
      lines.push(cmd);
    }
    lines.push('');
  }

  // Environment variables
  if (Object.keys(profile.envVars).length > 0) {
    lines.push('# Environment');
    for (const [k, v] of Object.entries(profile.envVars)) {
      lines.push(`ENV ${k}="${v}"`);
    }
    lines.push('');
  }

  // Exposed ports
  if (profile.exposedPorts.length > 0) {
    lines.push('# Exposed ports');
    for (const port of profile.exposedPorts) {
      lines.push(`EXPOSE ${port}`);
    }
    lines.push('');
  }

  lines.push('WORKDIR /app');
  lines.push('CMD ["bash"]');

  return lines.join('\n');
}

// ============================================================
// Profile API
// ============================================================

export function listProfiles(): Array<{
  id: string; name: string; description: string;
  categories: string[]; mappedTools: string[];
  resources: { cpus: string; memory: string };
}> {
  return Array.from(PROFILES.values()).map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    categories: p.categories,
    mappedTools: p.mappedTools,
    resources: p.resources,
  }));
}

export function getProfile(id: string): DockerProfileDefinition | undefined {
  return PROFILES.get(id);
}

export function getProfileForCategories(categories: string[]): DockerProfileDefinition | null {
  const lowerCats = categories.map(c => c.toLowerCase());
  let bestMatch: DockerProfileDefinition | null = null;
  let bestScore = 0;

  for (const profile of PROFILES.values()) {
    const score = profile.categories.filter(c =>
      lowerCats.some(lc => c.includes(lc) || lc.includes(c))
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = profile;
    }
  }
  return bestMatch;
}

// ============================================================
// Docker Desktop Auto-Start (Windows / macOS)
// ============================================================

export function startDockerDesktop(): { success: boolean; message: string; alreadyRunning?: boolean } {
  // Check if already running
  try {
    execSync('docker version --format "{{.Server.Os}}"', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, message: 'Docker is already running.', alreadyRunning: true };
  } catch {}

  const platform = os.platform();

  if (platform === 'win32') {
    // Windows: Try Docker Desktop, then Rancher Desktop, then Podman
    const dockerPaths = [
      'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
      `${process.env.LOCALAPPDATA}\\Programs\\Docker\\Docker\\Docker Desktop.exe`,
      'C:\\Program Files\\Rancher Desktop\\Rancher Desktop.exe',
    ];

    for (const dockerPath of dockerPaths) {
      if (fs.existsSync(dockerPath)) {
        try {
          execSync(`start "" "${dockerPath}"`, {
            encoding: 'utf-8', timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true, shell: 'cmd.exe',
          });
          return {
            success: true,
            message: `Started Docker from: ${dockerPath}. It may take 30-60 seconds to fully initialize. Check with 'status' action.`,
          };
        } catch {}
      }
    }

    // Try via PowerShell Start-Process
    try {
      execSync('powershell -NoProfile -Command "Start-Process \'Docker Desktop\' -ErrorAction SilentlyContinue"', {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { success: true, message: 'Attempted to start Docker Desktop via PowerShell. Wait 30-60s for initialization.' };
    } catch {}

    // Try wsl-based Docker
    try {
      execSync('wsl -d docker-desktop -e true', {
        encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { success: true, message: 'Docker Desktop WSL backend detected. Attempting to start service...' };
    } catch {}

    return { success: false, message: 'Docker Desktop not found. Install from https://docker.com/products/docker-desktop' };
  }

  if (platform === 'darwin') {
    try {
      execSync('open -a "Docker"', {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { success: true, message: 'Started Docker Desktop on macOS. Wait 30-60s for initialization.' };
    } catch {
      return { success: false, message: 'Docker Desktop not found on macOS. Install from https://docker.com' };
    }
  }

  if (platform === 'linux') {
    try {
      execSync('sudo systemctl start docker', {
        encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { success: true, message: 'Docker service started on Linux.' };
    } catch {
      try {
        execSync('sudo service docker start', {
          encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { success: true, message: 'Docker service started on Linux (SysVinit).' };
      } catch {
        return { success: false, message: 'Could not start Docker service. Try: sudo systemctl start docker' };
      }
    }
  }

  return { success: false, message: `Unsupported platform: ${platform}` };
}

export function waitForDocker(timeoutMs = 60000): boolean {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      execSync('docker version --format "{{.Server.Os}}"', {
        encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      return true;
    } catch {}
    // Sleep 2 seconds between checks
    execSync(os.platform() === 'win32' ? 'timeout /t 2 /nobreak > nul' : 'sleep 2', {
      timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
  return false;
}

// ============================================================
// Build Profile Image
// ============================================================

export function buildProfileImage(profileId: string, timeoutMs = 600000): {
  success: boolean;
  image: string;
  duration_ms: number;
  error?: string;
} {
  const profile = PROFILES.get(profileId);
  if (!profile) return { success: false, image: '', duration_ms: 0, error: `Unknown profile: ${profileId}` };

  const dockerfile = generateProfileDockerfile(profileId);
  if (!dockerfile) return { success: false, image: '', duration_ms: 0, error: 'Failed to generate Dockerfile' };

  const imageName = `vega-profile-${profileId}:latest`;
  const tmpDir = path.join(os.tmpdir(), `vegamcp_profile_${profileId}_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), dockerfile, 'utf-8');

  const start = Date.now();
  try {
    execSync(`docker build -t ${imageName} "${tmpDir}"`, {
      encoding: 'utf-8', timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, image: imageName, duration_ms: Date.now() - start };
  } catch (e: any) {
    return {
      success: false, image: imageName, duration_ms: Date.now() - start,
      error: e.stderr?.toString().substring(0, 2000) || e.message,
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

export function isProfileBuilt(profileId: string): boolean {
  const imageName = `vega-profile-${profileId}:latest`;
  try {
    const out = execSync(`docker images -q ${imageName}`, {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out.length > 0;
  } catch { return false; }
}
