/**
 * Advanced Asset Generator Engine
 * Generates rich, high-quality, fully colored SVG assets natively
 * without needing external API calls. Capable of creating logos,
 * abstract banners, complex background patterns, and placeholders.
 */

interface AssetConfig {
  type: string;
  query?: string;
  primaryColor?: string;
  secondaryColor?: string;
  width?: number;
  height?: number;
}

export function generateAsset(config: AssetConfig): { svg: string, base64: string, dataUri: string } {
  const { 
    type = 'placeholder', 
    query = 'generic', 
    primaryColor = '#3b82f6', 
    secondaryColor = '#ec4899', 
    width = 800, 
    height = 400 
  } = config;

  let svgContent = '';

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '128, 128, 128';
  };

  switch (type.toLowerCase()) {
    case 'logo': {
      // Create a modern geometric gradient logo
      const size = width || 120;
      const h = height || size;
      const initial = query.charAt(0).toUpperCase() || 'V';
      const c1 = primaryColor;
      const c2 = secondaryColor;
      
      svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${h}" width="${size}" height="${h}">
          <defs>
            <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${c1}" />
              <stop offset="100%" stop-color="${c2}" />
            </linearGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity="0.2" flood-color="${c1}"/>
            </filter>
          </defs>
          <rect width="${size}" height="${h}" rx="${size * 0.25}" fill="url(#logo-grad)" filter="url(#shadow)" />
          <circle cx="${size * 0.5}" cy="${h * 0.5}" r="${size * 0.35}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="${size * 0.05}"/>
          <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="${size * 0.4}" fill="#ffffff" letter-spacing="-0.05em">${initial}</text>
        </svg>
      `;
      break;
    }

    case 'banner': {
      // Abstract mesh gradient banner
      const c1 = primaryColor;
      const c2 = secondaryColor;
      
      svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
          <defs>
            <radialGradient id="mesh1" cx="20%" cy="30%" r="50%">
              <stop offset="0%" stop-color="${c1}" stop-opacity="1"/>
              <stop offset="100%" stop-color="${c1}" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="mesh2" cx="80%" cy="70%" r="60%">
              <stop offset="0%" stop-color="${c2}" stop-opacity="1"/>
              <stop offset="100%" stop-color="${c2}" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="mesh3" cx="50%" cy="20%" r="40%">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.4"/>
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="${width}" height="${height}" fill="#111827"/>
          <rect width="${width}" height="${height}" fill="url(#mesh1)"/>
          <rect width="${width}" height="${height}" fill="url(#mesh2)"/>
          <rect width="${width}" height="${height}" fill="url(#mesh3)"/>
          <g transform="translate(${width * 0.1}, ${height * 0.5})">
            <text x="0" y="-10" font-family="system-ui, sans-serif" font-weight="800" font-size="48" fill="#ffffff" letter-spacing="-0.02em">${query}</text>
            <rect x="0" y="20" width="80" height="6" rx="3" fill="${c2}"/>
          </g>
        </svg>
      `;
      break;
    }

    case 'pattern': {
      // Isometric grid or dots pattern
      const bg = primaryColor;
      const fg = secondaryColor;
      const patternSize = 40;
      
      svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <defs>
            <pattern id="dot-pattern" x="0" y="0" width="${patternSize}" height="${patternSize}" patternUnits="userSpaceOnUse">
              <circle cx="${patternSize/2}" cy="${patternSize/2}" r="3" fill="${fg}" opacity="0.3"/>
            </pattern>
            <linearGradient id="fade" x1="0" y1="0" x2="0" y2="100%">
              <stop offset="0%" stop-color="${bg}" stop-opacity="1"/>
              <stop offset="100%" stop-color="${bg}" stop-opacity="0.8"/>
            </linearGradient>
          </defs>
          <rect width="${width}" height="${height}" fill="url(#fade)"/>
          <rect width="${width}" height="${height}" fill="url(#dot-pattern)"/>
        </svg>
      `;
      break;
    }

    case 'avatar': {
      const size = width || 120;
      const h = height || size;
      const initials = query.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'U';
      const c1 = primaryColor;
      const fg = '#ffffff';

      svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${h}" width="${size}" height="${h}">
          <circle cx="${size/2}" cy="${h/2}" r="${size/2}" fill="${c1}"/>
          <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" font-size="${size * 0.4}" fill="${fg}">${initials}</text>
        </svg>
      `;
      break;
    }

    default: // placeholder
      svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
          <rect width="${width}" height="${height}" fill="${primaryColor}" opacity="0.1" stroke="${primaryColor}" stroke-width="2" stroke-dasharray="8 8"/>
          <line x1="0" y1="0" x2="${width}" y2="${height}" stroke="${primaryColor}" stroke-opacity="0.2" stroke-width="1"/>
          <line x1="${width}" y1="0" x2="0" y2="${height}" stroke="${primaryColor}" stroke-opacity="0.2" stroke-width="1"/>
          <rect x="${width/2 - 100}" y="${height/2 - 25}" width="200" height="50" rx="25" fill="${primaryColor}"/>
          <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="600" font-size="16" fill="#ffffff">${width} × ${height} • ${query}</text>
        </svg>
      `;
      break;
  }

  // Remove whitespace/newlines to create clean base64
  const cleanSvg = svgContent.trim().replace(/\n/g, '').replace(/\s{2,}/g, ' ');
  const base64 = Buffer.from(cleanSvg).toString('base64');
  const dataUri = `data:image/svg+xml;base64,${base64}`;

  return {
    svg: cleanSvg,
    base64,
    dataUri
  };
}
