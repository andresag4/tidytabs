import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTabsByDomain } from '../src/contextmenu.js';

const tab = (id, url, opts = {}) => ({
  id, url,
  windowId: opts.windowId ?? 1,
  index: opts.index ?? id
});

test('filterTabsByDomain: returns URLs matching the domain', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://github.com/b'),
    tab(3, 'https://youtube.com/x')
  ];
  assert.deepEqual(filterTabsByDomain(tabs, 'github.com'), [
    'https://github.com/a',
    'https://github.com/b'
  ]);
});

test('filterTabsByDomain: matches by registrable domain, not full host', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://api.github.com/b'),
    tab(3, 'https://docs.github.com/c')
  ];
  assert.deepEqual(filterTabsByDomain(tabs, 'github.com'), [
    'https://github.com/a',
    'https://api.github.com/b',
    'https://docs.github.com/c'
  ]);
});

test('filterTabsByDomain: skips tabs with no URL', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, ''),
    tab(3, undefined),
    tab(4, 'https://github.com/d')
  ];
  assert.deepEqual(filterTabsByDomain(tabs, 'github.com'), [
    'https://github.com/a',
    'https://github.com/d'
  ]);
});

test('filterTabsByDomain: skips tabs with ungroupable URLs', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'chrome://settings/'),
    tab(3, 'file:///x/y')
  ];
  assert.deepEqual(filterTabsByDomain(tabs, 'github.com'), [
    'https://github.com/a'
  ]);
});

test('filterTabsByDomain: sorts by (windowId, index)', () => {
  const tabs = [
    tab(3, 'https://github.com/c', { windowId: 2, index: 0 }),
    tab(1, 'https://github.com/a', { windowId: 1, index: 5 }),
    tab(2, 'https://github.com/b', { windowId: 1, index: 2 })
  ];
  assert.deepEqual(filterTabsByDomain(tabs, 'github.com'), [
    'https://github.com/b',  // win 1, idx 2
    'https://github.com/a',  // win 1, idx 5
    'https://github.com/c'   // win 2, idx 0
  ]);
});

test('filterTabsByDomain: empty input returns empty array', () => {
  assert.deepEqual(filterTabsByDomain([], 'github.com'), []);
});

test('filterTabsByDomain: no matches returns empty array', () => {
  const tabs = [tab(1, 'https://github.com/a')];
  assert.deepEqual(filterTabsByDomain(tabs, 'youtube.com'), []);
});
