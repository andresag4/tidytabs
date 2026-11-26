import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateTabIds, findTabIdsToSleep, IDLE_MS } from '../src/cleanup.js';

const tab = (id, url, o = {}) => ({ id, url, groupId: -1, lastAccessed: 0, ...o });

test('findDuplicateTabIds: keeps the most recently viewed copy, ignores #hash', () => {
  const tabs = [tab(1, 'https://a.com/x', { lastAccessed: 5 }), tab(2, 'https://a.com/x#top', { lastAccessed: 9 }), tab(3, 'https://a.com/y')];
  assert.deepEqual(findDuplicateTabIds(tabs), [1]);
});

test('findDuplicateTabIds: keeps the active copy and never closes pinned/audible', () => {
  const tabs = [
    tab(1, 'https://a.com/x', { lastAccessed: 9 }),
    tab(2, 'https://a.com/x', { active: true }),
    tab(3, 'https://a.com/x', { pinned: true }),
    tab(4, 'https://a.com/x', { audible: true })
  ];
  assert.deepEqual(findDuplicateTabIds(tabs), [1]);
});

test('findTabIdsToSleep: collapsed group, YouTube, idle — skipping protected and non-web tabs', () => {
  const now = 10 * IDLE_MS;
  const fresh = { lastAccessed: now };
  const tabs = [
    tab(1, 'https://a.com', { ...fresh, groupId: 7 }),            // collapsed group → sleep
    tab(2, 'https://www.youtube.com/watch?v=x', fresh),           // YouTube → sleep
    tab(3, 'https://b.com', { lastAccessed: now - IDLE_MS }),     // idle → sleep
    tab(4, 'https://b.com/fresh', fresh),                          // recent → keep
    tab(5, 'https://www.youtube.com/watch?v=y', { audible: true }),// playing → keep
    tab(6, 'https://a.com', { ...fresh, groupId: 7, active: true }),
    tab(7, 'https://a.com', { groupId: 7, discarded: true }),
    tab(8, 'chrome://settings', { groupId: 7 })
  ];
  assert.deepEqual(findTabIdsToSleep(tabs, new Set([7]), now), [1, 2, 3]);
});
