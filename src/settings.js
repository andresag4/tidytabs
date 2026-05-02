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

async function readStore() {
  if (typeof chrome === 'undefined' || !chrome.storage) return {};
  try {
    return await chrome.storage.sync.get(null);
  } catch (e) {
    console.warn('tidytabs: storage.sync read failed, falling back to local', e);
    try {
      return await chrome.storage.local.get(null);
    } catch (e2) {
      console.error('tidytabs: storage.local read also failed', e2);
      return {};
    }
  }
}

async function writeStore(patch) {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  try {
    await chrome.storage.sync.set(patch);
  } catch (e) {
    console.warn('tidytabs: storage.sync write failed, falling back to local', e);
    try {
      await chrome.storage.local.set(patch);
    } catch (e2) {
      console.error('tidytabs: storage.local write also failed', e2);
    }
  }
}

export async function getSettings() {
  const raw = await readStore();
  return applyDefaults(raw);
}

export async function setSetting(key, value) {
  if (!(key in DEFAULTS)) throw new Error(`unknown setting: ${key}`);
  await writeStore({ [key]: value });
}

export async function resetSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  try {
    await chrome.storage.sync.clear();
  } catch (e) {
    console.warn('tidytabs: storage.sync clear failed', e);
  }
  try {
    await chrome.storage.local.clear();
  } catch (e) {
    console.warn('tidytabs: storage.local clear failed', e);
  }
}
