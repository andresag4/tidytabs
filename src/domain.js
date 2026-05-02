export function extractDomain(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname;
  if (!host) return null;
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

export function prettyName(domain) {
  if (typeof domain !== 'string' || domain.length === 0) return '';
  const label = domain.split('.')[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const COLORS = [
  'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'
];

export function hashColor(domain) {
  if (typeof domain !== 'string' || domain.length === 0) return COLORS[0];
  let h = 5381;
  for (let i = 0; i < domain.length; i++) {
    h = ((h << 5) + h + domain.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(h) % COLORS.length];
}

export function paletteColor(index) {
  const i = ((index % COLORS.length) + COLORS.length) % COLORS.length;
  return COLORS[i];
}
