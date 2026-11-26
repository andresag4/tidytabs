// Pure planning for the one-click cleanup: which tabs to close and which to sleep (discard).
// Never touches the active tab of any window, pinned tabs, or tabs playing audio.

export const IDLE_MS = 30 * 60 * 1000;

const protectedTab = (t) => t.active || t.pinned || t.audible;
const sameUrl = (url) => (typeof url === 'string' ? url.split('#')[0] : '');

// Duplicates = same URL ignoring #hash. Keep the active/pinned/audible copy, else the most recently viewed.
export function findDuplicateTabIds(tabs) {
  const byUrl = new Map();
  for (const t of tabs) {
    const key = sameUrl(t.url);
    if (!key) continue;
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(t);
  }
  const close = [];
  for (const list of byUrl.values()) {
    if (list.length < 2) continue;
    const keep = list.find(protectedTab)
      ?? list.reduce((a, b) => ((b.lastAccessed ?? 0) > (a.lastAccessed ?? 0) ? b : a));
    for (const t of list) if (t !== keep && !protectedTab(t)) close.push(t.id);
  }
  return close;
}

const isYouTube = (url) => /^https?:\/\/([a-z0-9-]+\.)*youtube\.com\//i.test(url);

// Sleep background tabs that are in a collapsed group, are YouTube, or have been idle IDLE_MS+.
export function findTabIdsToSleep(tabs, collapsedGroupIds, now) {
  return tabs
    .filter(t => !protectedTab(t) && !t.discarded && /^https?:\/\//.test(t.url ?? ''))
    .filter(t => collapsedGroupIds.has(t.groupId)
      || isYouTube(t.url)
      || now - (t.lastAccessed ?? now) >= IDLE_MS)
    .map(t => t.id);
}
