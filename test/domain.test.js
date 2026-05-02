import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDomain } from '../src/domain.js';

test('extractDomain: simple https URL', () => {
  assert.equal(extractDomain('https://github.com/user/repo'), 'github.com');
});

test('extractDomain: strips subdomain', () => {
  assert.equal(extractDomain('https://news.ycombinator.com/item?id=1'), 'ycombinator.com');
});

test('extractDomain: strips www', () => {
  assert.equal(extractDomain('https://www.youtube.com/watch?v=abc'), 'youtube.com');
});

test('extractDomain: deep subdomains', () => {
  assert.equal(extractDomain('https://a.b.c.example.com/x'), 'example.com');
});

test('extractDomain: ports and query strings ignored', () => {
  assert.equal(extractDomain('https://github.com:443/x?q=1#frag'), 'github.com');
});

test('extractDomain: returns null for chrome:// URLs', () => {
  assert.equal(extractDomain('chrome://settings/'), null);
});

test('extractDomain: returns null for file:// URLs', () => {
  assert.equal(extractDomain('file:///Users/x/index.html'), null);
});

test('extractDomain: returns null for view-source: URLs', () => {
  assert.equal(extractDomain('view-source:https://example.com/'), null);
});

test('extractDomain: returns null for malformed input', () => {
  assert.equal(extractDomain('not a url'), null);
  assert.equal(extractDomain(''), null);
  assert.equal(extractDomain(undefined), null);
});

test('extractDomain: two-label hostname returned as-is', () => {
  assert.equal(extractDomain('https://example.com/'), 'example.com');
});

test('extractDomain: localhost returned as-is', () => {
  assert.equal(extractDomain('http://localhost:3000/'), 'localhost');
});

import { prettyName } from '../src/domain.js';

test('prettyName: capitalizes the second-level label', () => {
  assert.equal(prettyName('github.com'), 'Github');
});

test('prettyName: works with single-label hostnames', () => {
  assert.equal(prettyName('localhost'), 'Localhost');
});

test('prettyName: preserves hyphens', () => {
  assert.equal(prettyName('news-feed.com'), 'News-feed');
});

test('prettyName: handles all-lowercase and mixed-case input', () => {
  assert.equal(prettyName('GITHUB.com'), 'GITHUB');
});

import { COLORS, hashColor, paletteColor } from '../src/domain.js';

test('COLORS: contains exactly Chrome\'s 9 group colors', () => {
  assert.deepEqual(
    [...COLORS].sort(),
    ['blue', 'cyan', 'green', 'grey', 'orange', 'pink', 'purple', 'red', 'yellow']
  );
});

test('hashColor: deterministic — same domain returns same color', () => {
  const a = hashColor('github.com');
  const b = hashColor('github.com');
  assert.equal(a, b);
});

test('hashColor: returns a color from COLORS', () => {
  assert.ok(COLORS.includes(hashColor('github.com')));
  assert.ok(COLORS.includes(hashColor('youtube.com')));
});

test('hashColor: distributes across the palette for varied inputs', () => {
  const sample = ['github.com', 'youtube.com', 'reddit.com', 'news.ycombinator.com',
    'twitter.com', 'stackoverflow.com', 'wikipedia.org', 'amazon.com', 'apple.com'];
  const used = new Set(sample.map(hashColor));
  // We're not asserting perfect distribution, just that it isn't degenerate.
  assert.ok(used.size >= 3, `expected ≥3 distinct colors, got ${used.size}`);
});

test('paletteColor: index 0 maps to first palette entry', () => {
  assert.equal(paletteColor(0), COLORS[0]);
});

test('paletteColor: wraps modulo COLORS.length', () => {
  assert.equal(paletteColor(COLORS.length), COLORS[0]);
  assert.equal(paletteColor(COLORS.length + 1), COLORS[1]);
});

test('paletteColor: handles negative indices defensively', () => {
  assert.ok(COLORS.includes(paletteColor(-1)));
});
