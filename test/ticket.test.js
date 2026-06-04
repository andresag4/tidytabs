import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTickets } from '../src/ticket.js';

test('extractTickets: single ticket', () => {
  assert.deepEqual(extractTickets('[FE-3333] Fix login'), ['FE-3333']);
});

test('extractTickets: multiple tickets in one title (unique, in order)', () => {
  assert.deepEqual(
    extractTickets('[FE-3333][FE-3334] Cleanup'),
    ['FE-3333', 'FE-3334']
  );
});

test('extractTickets: deduplicates repeats', () => {
  assert.deepEqual(
    extractTickets('FE-3333 something FE-3333 again'),
    ['FE-3333']
  );
});

test('extractTickets: ignores lowercase prefix', () => {
  assert.deepEqual(extractTickets('the-3333 chapter'), []);
});

test('extractTickets: requires 2+ digits', () => {
  assert.deepEqual(extractTickets('FE-3 too short'), []);
  assert.deepEqual(extractTickets('FE-33 ok'), ['FE-33']);
});

test('extractTickets: works with longer prefixes', () => {
  assert.deepEqual(
    extractTickets('TIDYTABS-1234: implement feature'),
    ['TIDYTABS-1234']
  );
});

test('extractTickets: no match → empty array', () => {
  assert.deepEqual(extractTickets('Just a regular tab title'), []);
});

test('extractTickets: non-string input → empty', () => {
  assert.deepEqual(extractTickets(undefined), []);
  assert.deepEqual(extractTickets(null), []);
  assert.deepEqual(extractTickets(42), []);
});

test('extractTickets: ticket embedded in noisy title', () => {
  assert.deepEqual(
    extractTickets('Fix login (FE-3333) by user · Pull Request #1234'),
    ['FE-3333']
  );
});

test('extractTickets: word boundary on right side', () => {
  // FE-3333abc should NOT match because boundary fails between digit and letter? Actually \b matches between word chars; we need digit-then-letter to not match the FE-3333 prefix.
  // In ASCII, "3" and "a" are both \w, so \b is FALSE between them; the match `\b...\d{2,}\b` requires \b after digits, which fails. So FE-3333abc does NOT match.
  assert.deepEqual(extractTickets('FE-3333abc'), []);
});

import { bucketByTicket } from '../src/ticket.js';

const tk = (id, title) => ({ id, title });

test('bucketByTicket: single-ticket tabs go to their ticket', () => {
  const tabs = [
    tk(1, '[FE-3333] Fix login'),
    tk(2, 'FE-3333 PR #1'),
    tk(3, 'FE-3334 unrelated')
  ];
  const buckets = bucketByTicket(tabs);
  assert.deepEqual(buckets.get('FE-3333').map(t => t.id), [1, 2]);
  assert.equal(buckets.has('FE-3334'), false); // singleton dropped
});

test('bucketByTicket: multi-ticket tab joins largest cluster', () => {
  const tabs = [
    tk(1, '[FE-3333] PR A'),
    tk(2, '[FE-3333] Jira A'),
    tk(3, '[FE-3334] PR B'),
    tk(4, '[FE-3333][FE-3334] Shared work') // should go to FE-3333 (cluster=3)
  ];
  const buckets = bucketByTicket(tabs);
  assert.deepEqual(buckets.get('FE-3333').map(t => t.id), [1, 2, 4]);
  assert.equal(buckets.has('FE-3334'), false); // FE-3334 ends up with just tab 3 → singleton dropped
});

test('bucketByTicket: ties broken by lexicographic ticket ID', () => {
  const tabs = [
    tk(1, '[FE-3333] one'),
    tk(2, '[FE-3334] two'),
    tk(3, '[FE-3333][FE-3334] both') // FE-3333 < FE-3334 lex, both have 1 candidate
  ];
  const buckets = bucketByTicket(tabs);
  // FE-3333 has candidates [1, 3]; FE-3334 has [2, 3]. Both size 2 initially.
  // For tab 3: tie → goes to FE-3333 (lex smaller).
  // Final: FE-3333 = [1, 3], FE-3334 = [2] singleton → dropped.
  assert.deepEqual(buckets.get('FE-3333').map(t => t.id), [1, 3]);
  assert.equal(buckets.has('FE-3334'), false);
});

test('bucketByTicket: tabs with no tickets are not in any bucket', () => {
  const tabs = [
    tk(1, '[FE-3333] one'),
    tk(2, '[FE-3333] two'),
    tk(3, 'no ticket here')
  ];
  const buckets = bucketByTicket(tabs);
  assert.deepEqual(buckets.get('FE-3333').map(t => t.id), [1, 2]);
  assert.equal(buckets.size, 1);
});

test('bucketByTicket: empty input → empty map', () => {
  assert.equal(bucketByTicket([]).size, 0);
});

test('bucketByTicket: all singletons → empty map', () => {
  const tabs = [tk(1, '[FE-3333] x'), tk(2, '[FE-3334] y')];
  assert.equal(bucketByTicket(tabs).size, 0);
});
