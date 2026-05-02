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
