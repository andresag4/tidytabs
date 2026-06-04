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
