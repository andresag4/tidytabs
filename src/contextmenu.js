// This file used to register chrome.contextMenus items, but Chrome doesn't
// support contexts: ['tab'] (Firefox-only). All actions now live in the popup
// (popup.html / src/popup.js → src/actions.js).
//
// The pure helpers below are still imported by src/actions.js and exercised
// by test/contextmenu.test.js — they stay here because moving them would
// break the test import path.

import { extractDomain } from './domain.js';

export function filterTabsByDomain(tabs, targetDomain) {
  if (!targetDomain) return [];
  const matching = [];
  for (const t of tabs) {
    if (!t || typeof t.url !== 'string' || t.url.length === 0) continue;
    if (extractDomain(t.url) !== targetDomain) continue;
    matching.push(t);
  }
  matching.sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index));
  return matching.map(t => t.url);
}

export function filterTabIdsByDomain(tabs, targetDomain) {
  if (!targetDomain) return [];
  const matching = [];
  for (const t of tabs) {
    if (!t || typeof t.url !== 'string' || t.url.length === 0) continue;
    if (extractDomain(t.url) !== targetDomain) continue;
    matching.push(t);
  }
  matching.sort((a, b) => (a.windowId - b.windowId) || (a.index - b.index));
  return matching.map(t => t.id);
}

export function sortTabIdsByUrl(tabs) {
  const indexed = tabs.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const ua = (a.t && typeof a.t.url === 'string') ? a.t.url : '';
    const ub = (b.t && typeof b.t.url === 'string') ? b.t.url : '';
    if (ua < ub) return -1;
    if (ua > ub) return 1;
    return a.i - b.i;
  });
  return indexed.map(x => x.t.id);
}

export function sortTabIdsByAge(tabs) {
  const indexed = tabs.map((t, i) => ({ t, i }));
  indexed.sort((a, b) => {
    const la = (a.t && typeof a.t.lastAccessed === 'number') ? a.t.lastAccessed : 0;
    const lb = (b.t && typeof b.t.lastAccessed === 'number') ? b.t.lastAccessed : 0;
    if (la !== lb) return la - lb;
    return a.i - b.i;
  });
  return indexed.map(x => x.t.id);
}
