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
