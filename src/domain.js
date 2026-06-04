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

export const PRESETS = Object.freeze({
  'github.com': 'grey',
  'youtube.com': 'red',
  'google.com': 'blue',
  'gmail.com': 'red',
  'twitter.com': 'cyan',
  'x.com': 'grey',
  'reddit.com': 'orange',
  'stackoverflow.com': 'orange',
  'linkedin.com': 'blue',
  'facebook.com': 'blue',
  'amazon.com': 'orange',
  'apple.com': 'grey',
  'wikipedia.org': 'grey',
  'ycombinator.com': 'orange',
  'notion.so': 'grey',
  'figma.com': 'purple',
  'linear.app': 'purple',
  'atlassian.net': 'blue',
  'slack.com': 'purple',
  'discord.com': 'purple',
  'spotify.com': 'green',
  'netflix.com': 'red',
  'twitch.tv': 'purple'
});
