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

import { filterTabIdsByDomain } from '../src/contextmenu.js';

const tabT = (id, url, opts = {}) => ({
  id, url,
  windowId: opts.windowId ?? 1,
  index: opts.index ?? id
});

test('filterTabIdsByDomain: returns IDs for matching tabs', () => {
  const tabs = [
    tabT(1, 'https://github.com/a'),
    tabT(2, 'https://youtube.com/x'),
    tabT(3, 'https://github.com/c')
  ];
  assert.deepEqual(filterTabIdsByDomain(tabs, 'github.com'), [1, 3]);
});

test('filterTabIdsByDomain: skips ungroupable URLs and missing URLs', () => {
  const tabs = [
    tabT(1, 'https://github.com/a'),
    tabT(2, 'chrome://settings/'),
    tabT(3, ''),
    tabT(4, 'https://github.com/d')
  ];
  assert.deepEqual(filterTabIdsByDomain(tabs, 'github.com'), [1, 4]);
});

test('filterTabIdsByDomain: matches subdomains via registrable domain', () => {
  const tabs = [
    tabT(1, 'https://github.com/a'),
    tabT(2, 'https://api.github.com/b'),
    tabT(3, 'https://docs.github.com/c')
  ];
  assert.deepEqual(filterTabIdsByDomain(tabs, 'github.com'), [1, 2, 3]);
});

test('filterTabIdsByDomain: sorts by (windowId, index)', () => {
  const tabs = [
    tabT(3, 'https://github.com/c', { windowId: 2, index: 0 }),
    tabT(1, 'https://github.com/a', { windowId: 1, index: 5 }),
    tabT(2, 'https://github.com/b', { windowId: 1, index: 2 })
  ];
  assert.deepEqual(filterTabIdsByDomain(tabs, 'github.com'), [2, 1, 3]);
});

test('filterTabIdsByDomain: empty input returns empty array', () => {
  assert.deepEqual(filterTabIdsByDomain([], 'github.com'), []);
});

test('filterTabIdsByDomain: no matches returns empty array', () => {
  const tabs = [tabT(1, 'https://github.com/a')];
  assert.deepEqual(filterTabIdsByDomain(tabs, 'youtube.com'), []);
});

import { sortTabIdsByUrl } from '../src/contextmenu.js';

const tabU = (id, url) => ({ id, url });

test('sortTabIdsByUrl: sorts ascending by URL string', () => {
  const tabs = [
    tabU(3, 'https://github.com/c'),
    tabU(1, 'https://github.com/a'),
    tabU(2, 'https://github.com/b')
  ];
  assert.deepEqual(sortTabIdsByUrl(tabs), [1, 2, 3]);
});

test('sortTabIdsByUrl: empty array returns empty', () => {
  assert.deepEqual(sortTabIdsByUrl([]), []);
});

test('sortTabIdsByUrl: single tab returns single id', () => {
  assert.deepEqual(sortTabIdsByUrl([tabU(7, 'https://x.com')]), [7]);
});

test('sortTabIdsByUrl: tabs with no URL sort to the front', () => {
  const tabs = [
    tabU(1, 'https://github.com/a'),
    tabU(2, undefined),
    tabU(3, ''),
    tabU(4, 'https://github.com/b')
  ];
  // Two empty-url tabs first (in input order), then a, then b.
  assert.deepEqual(sortTabIdsByUrl(tabs), [2, 3, 1, 4]);
});

test('sortTabIdsByUrl: stable for ties', () => {
  const tabs = [
    tabU(10, 'https://same.com'),
    tabU(20, 'https://same.com'),
    tabU(30, 'https://same.com')
  ];
  assert.deepEqual(sortTabIdsByUrl(tabs), [10, 20, 30]);
});

test('sortTabIdsByUrl: case-sensitive comparison', () => {
  // Uppercase letters sort before lowercase in raw string compare.
  const tabs = [
    tabU(1, 'https://github.com/a'),
    tabU(2, 'https://github.com/B'),
    tabU(3, 'https://github.com/A')
  ];
  // ASCII order: 'A' (65) < 'B' (66) < 'a' (97)
  assert.deepEqual(sortTabIdsByUrl(tabs), [3, 2, 1]);
});
