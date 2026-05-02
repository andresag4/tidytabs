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
