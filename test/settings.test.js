import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, applyDefaults } from '../src/settings.js';

test('DEFAULTS: matches spec', () => {
  assert.deepEqual(DEFAULTS, {
    groupOrder: 'leftmost',
    ungroupedPlacement: 'end',
    domainThreshold: 3,
    autoCollapse: true,
    colorStrategy: 'stable-hash',
    scope: 'current'
  });
});

test('applyDefaults: empty object returns defaults', () => {
  assert.deepEqual(applyDefaults({}), DEFAULTS);
});

test('applyDefaults: undefined returns defaults', () => {
  assert.deepEqual(applyDefaults(undefined), DEFAULTS);
});

test('applyDefaults: stored values override defaults', () => {
  const result = applyDefaults({ groupOrder: 'alphabetical', autoCollapse: false });
  assert.equal(result.groupOrder, 'alphabetical');
  assert.equal(result.autoCollapse, false);
  assert.equal(result.domainThreshold, 3); // default preserved
});

test('applyDefaults: ignores unknown keys', () => {
  const result = applyDefaults({ groupOrder: 'leftmost', bogus: 'value' });
  assert.equal('bogus' in result, false);
});

test('applyDefaults: invalid enum values fall back to default', () => {
  const result = applyDefaults({ groupOrder: 'nonsense' });
  assert.equal(result.groupOrder, 'leftmost');
});

test('applyDefaults: out-of-range threshold clamps to range', () => {
  assert.equal(applyDefaults({ domainThreshold: 1 }).domainThreshold, 2);
  assert.equal(applyDefaults({ domainThreshold: 10 }).domainThreshold, 5);
  assert.equal(applyDefaults({ domainThreshold: 'bogus' }).domainThreshold, 3);
});
