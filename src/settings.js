export const DEFAULTS = Object.freeze({
  groupOrder: 'leftmost',
  ungroupedPlacement: 'end',
  domainThreshold: 3,
  autoCollapse: true,
  colorStrategy: 'stable-hash',
  scope: 'current'
});

const ENUMS = {
  groupOrder: ['leftmost', 'alphabetical', 'largest'],
  ungroupedPlacement: ['end', 'start', 'leave'],
  colorStrategy: ['stable-hash', 'random', 'palette'],
  scope: ['current', 'all']
};

export function applyDefaults(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;

  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in raw)) continue;
    const value = raw[key];

    if (key in ENUMS) {
      if (ENUMS[key].includes(value)) out[key] = value;
      continue;
    }
    if (key === 'autoCollapse') {
      if (typeof value === 'boolean') out[key] = value;
      continue;
    }
    if (key === 'domainThreshold') {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = Math.min(5, Math.max(2, Math.round(n)));
      continue;
    }
  }
  return out;
}
