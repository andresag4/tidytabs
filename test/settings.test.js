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
    scope: 'current',
    domainColors: {}
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

test('DEFAULTS: includes domainColors empty object', () => {
  assert.deepEqual(DEFAULTS.domainColors, {});
});

test('applyDefaults: valid domainColors entries preserved', () => {
  const r = applyDefaults({ domainColors: { 'github.com': 'blue', 'youtube.com': 'green' } });
  assert.deepEqual(r.domainColors, { 'github.com': 'blue', 'youtube.com': 'green' });
});

test('applyDefaults: invalid color values dropped', () => {
  const r = applyDefaults({ domainColors: { 'github.com': 'bogus', 'youtube.com': 'red' } });
  assert.deepEqual(r.domainColors, { 'youtube.com': 'red' });
});

test('applyDefaults: empty domain keys dropped', () => {
  const r = applyDefaults({ domainColors: { '': 'red', 'github.com': 'blue' } });
  assert.deepEqual(r.domainColors, { 'github.com': 'blue' });
});

test('applyDefaults: non-object domainColors becomes empty', () => {
  assert.deepEqual(applyDefaults({ domainColors: 'not an object' }).domainColors, {});
  assert.deepEqual(applyDefaults({ domainColors: null }).domainColors, {});
});

test('applyDefaults: domainColors absent → defaults to empty object', () => {
  const r = applyDefaults({ groupOrder: 'leftmost' });
  assert.deepEqual(r.domainColors, {});
});
