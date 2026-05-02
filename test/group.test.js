import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketByDomain } from '../src/group.js';

const tab = (id, url, opts = {}) => ({
  id, url,
  groupId: opts.groupId ?? -1, // -1 = chrome.tabGroups.TAB_GROUP_ID_NONE
  pinned: opts.pinned ?? false,
  index: opts.index ?? id
});

test('bucketByDomain: groups same-domain tabs above threshold', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://github.com/b'),
    tab(3, 'https://github.com/c')
  ];
  const result = bucketByDomain(tabs, 3);
  assert.equal(result.size, 1);
  assert.deepEqual(result.get('github.com').map(t => t.id), [1, 2, 3]);
});

test('bucketByDomain: drops buckets below threshold', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://github.com/b'),
    tab(3, 'https://youtube.com/x')
  ];
  const result = bucketByDomain(tabs, 3);
  assert.equal(result.size, 0);
});

test('bucketByDomain: skips tabs already in a group', () => {
  const tabs = [
    tab(1, 'https://github.com/a', { groupId: 100 }),
    tab(2, 'https://github.com/b'),
    tab(3, 'https://github.com/c'),
    tab(4, 'https://github.com/d')
  ];
  const result = bucketByDomain(tabs, 3);
  assert.deepEqual(result.get('github.com').map(t => t.id), [2, 3, 4]);
});

test('bucketByDomain: skips pinned tabs', () => {
  const tabs = [
    tab(1, 'https://github.com/a', { pinned: true }),
    tab(2, 'https://github.com/b'),
    tab(3, 'https://github.com/c'),
    tab(4, 'https://github.com/d')
  ];
  const result = bucketByDomain(tabs, 3);
  assert.deepEqual(result.get('github.com').map(t => t.id), [2, 3, 4]);
});

test('bucketByDomain: skips ungroupable URLs', () => {
  const tabs = [
    tab(1, 'chrome://settings/'),
    tab(2, 'https://github.com/a'),
    tab(3, 'https://github.com/b'),
    tab(4, 'https://github.com/c')
  ];
  const result = bucketByDomain(tabs, 3);
  assert.equal(result.has('github.com'), true);
  assert.equal(result.size, 1);
});

test('bucketByDomain: respects threshold parameter', () => {
  const tabs = [tab(1, 'https://github.com/a'), tab(2, 'https://github.com/b')];
  assert.equal(bucketByDomain(tabs, 3).size, 0);
  assert.equal(bucketByDomain(tabs, 2).size, 1);
});

import { pickGroupColor } from '../src/group.js';
import { hashColor, paletteColor, COLORS } from '../src/domain.js';

test('pickGroupColor: stable-hash uses hashColor', () => {
  const color = pickGroupColor('github.com', 0, { colorStrategy: 'stable-hash' });
  assert.equal(color, hashColor('github.com'));
});

test('pickGroupColor: palette uses paletteColor by index', () => {
  assert.equal(
    pickGroupColor('github.com', 2, { colorStrategy: 'palette' }),
    paletteColor(2)
  );
});

test('pickGroupColor: random returns a color from the palette', () => {
  const color = pickGroupColor('github.com', 0, { colorStrategy: 'random' });
  assert.ok(COLORS.includes(color));
});

import { computeGroupOrder } from '../src/group.js';

const grp = (id, name, leftmostIndex, size) => ({ id, name, leftmostIndex, size });

test('computeGroupOrder: leftmost — sorts by leftmostIndex ascending', () => {
  const groups = [
    grp(1, 'Github', 5, 3),
    grp(2, 'Youtube', 1, 2),
    grp(3, 'Reddit', 9, 4)
  ];
  const order = computeGroupOrder(groups, { groupOrder: 'leftmost' });
  assert.deepEqual(order, [2, 1, 3]);
});

test('computeGroupOrder: alphabetical — sorts by name', () => {
  const groups = [
    grp(1, 'Youtube', 0, 2),
    grp(2, 'Github', 5, 3),
    grp(3, 'Reddit', 9, 4)
  ];
  const order = computeGroupOrder(groups, { groupOrder: 'alphabetical' });
  assert.deepEqual(order, [2, 3, 1]);
});

test('computeGroupOrder: largest — sorts by size desc', () => {
  const groups = [
    grp(1, 'Github', 0, 2),
    grp(2, 'Youtube', 5, 5),
    grp(3, 'Reddit', 9, 3)
  ];
  const order = computeGroupOrder(groups, { groupOrder: 'largest' });
  assert.deepEqual(order, [2, 3, 1]);
});

test('computeGroupOrder: largest — alphabetical tiebreak', () => {
  const groups = [
    grp(1, 'Reddit', 0, 3),
    grp(2, 'Github', 5, 3),
    grp(3, 'Youtube', 9, 3)
  ];
  const order = computeGroupOrder(groups, { groupOrder: 'largest' });
  assert.deepEqual(order, [2, 1, 3]);
});

test('computeGroupOrder: empty input', () => {
  assert.deepEqual(computeGroupOrder([], { groupOrder: 'leftmost' }), []);
});
