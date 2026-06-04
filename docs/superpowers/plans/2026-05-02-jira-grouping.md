# Jira ticket grouping — implementation plan

**Goal:** New right-click toolbar item "Group by Jira ticket" that scans tab titles for ticket IDs like `FE-3333` and groups matching tabs together — even across different domains.

**Spec:** [docs/superpowers/specs/2026-05-02-jira-grouping-design.md](../specs/2026-05-02-jira-grouping-design.md)

---

## File Structure

| Path | New / Modify | Responsibility |
|---|---|---|
| `src/ticket.js` | New | Pure: `extractTickets`, `bucketByTicket` |
| `test/ticket.test.js` | New | Unit tests |
| `src/group.js` | Modify | Add `runTicketTriage` |
| `src/contextmenu.js` | Modify | Register menu item; route to new handler |

---

## Tasks

### Task 1: `extractTickets` (TDD)

**Files:** Create `test/ticket.test.js`, create `src/ticket.js`

- [ ] **Step 1: Write the failing test**

`test/ticket.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/ticket.js` not found.

- [ ] **Step 3: Implement `extractTickets`**

`src/ticket.js`:

```js
const TICKET_RE = /\b[A-Z]{2,10}-\d{2,}\b/g;

export function extractTickets(title) {
  if (typeof title !== 'string') return [];
  const found = title.match(TICKET_RE);
  if (!found) return [];
  const seen = new Set();
  const out = [];
  for (const t of found) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 83 tests total (73 + 10 new).

- [ ] **Step 5: Commit**

```bash
git add src/ticket.js test/ticket.test.js
git commit -m "feat(ticket): extractTickets pure helper"
```

---

### Task 2: `bucketByTicket` (TDD)

**Files:** Modify `test/ticket.test.js`, modify `src/ticket.js`

- [ ] **Step 1: Append failing tests**

Append to `test/ticket.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `bucketByTicket is not a function`.

- [ ] **Step 3: Implement `bucketByTicket`**

Append to `src/ticket.js`:

```js
export function bucketByTicket(tabs) {
  // Pass 1: candidate buckets — each tab in all of its tickets.
  const candidates = new Map(); // ticketId → Tab[]
  const tabTickets = new Map(); // tab.id → ticketId[]
  for (const tab of tabs) {
    const tickets = extractTickets(tab.title);
    if (tickets.length === 0) continue;
    tabTickets.set(tab.id, tickets);
    for (const t of tickets) {
      if (!candidates.has(t)) candidates.set(t, []);
      candidates.get(t).push(tab);
    }
  }

  // Pass 2: resolve multi-ticket tabs to a single primary ticket.
  const primary = new Map(); // ticketId → Tab[]
  for (const tab of tabs) {
    const tickets = tabTickets.get(tab.id);
    if (!tickets || tickets.length === 0) continue;
    if (tickets.length === 1) {
      const t = tickets[0];
      if (!primary.has(t)) primary.set(t, []);
      primary.get(t).push(tab);
      continue;
    }
    // Multi-ticket: pick largest cluster, ties → lex smallest.
    let bestTicket = null, bestSize = -1;
    for (const t of tickets) {
      const size = candidates.get(t).length;
      if (size > bestSize || (size === bestSize && t < bestTicket)) {
        bestTicket = t;
        bestSize = size;
      }
    }
    if (!primary.has(bestTicket)) primary.set(bestTicket, []);
    primary.get(bestTicket).push(tab);
  }

  // Pass 3: drop buckets below threshold (< 2).
  for (const [t, list] of primary) {
    if (list.length < 2) primary.delete(t);
  }
  return primary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 89 tests total (83 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/ticket.js test/ticket.test.js
git commit -m "feat(ticket): bucketByTicket with largest-cluster resolution"
```

---

### Task 3: `runTicketTriage` in group.js

**Files:** Modify `src/group.js`

- [ ] **Step 1: Add the new import**

At the top of `src/group.js`, add the ticket import alongside the existing domain.js import:

```js
import { bucketByTicket } from './ticket.js';
```

- [ ] **Step 2: Add `runTicketTriage` function**

Append to `src/group.js`:

```js
export async function runTicketTriage(settings) {
  const windowIds = [];
  if (settings.scope === 'all') {
    const wins = await chrome.windows.getAll({ populate: false });
    for (const w of wins) windowIds.push(w.id);
  } else {
    const w = await chrome.windows.getCurrent();
    windowIds.push(w.id);
  }

  for (const windowId of windowIds) {
    const allTabs = await chrome.tabs.query({ windowId });
    const eligible = allTabs.filter(t => {
      if (t.pinned) return false;
      if (typeof t.url !== 'string') return false;
      if (!t.url.startsWith('http://') && !t.url.startsWith('https://')) return false;
      return true;
    });

    const buckets = bucketByTicket(eligible);
    if (buckets.size === 0) continue;

    // Snapshot existing ticket-titled groups for merge-into-existing semantics.
    const existingGroups = await chrome.tabGroups.query({ windowId });

    for (const [ticketId, tabsInBucket] of buckets) {
      const tabIds = tabsInBucket.map(t => t.id);
      const existing = existingGroups.find(g => g.title === ticketId);
      if (existing) {
        await chrome.tabs.group({ tabIds, groupId: existing.id });
      } else {
        const newGroupId = await chrome.tabs.group({
          tabIds,
          createProperties: { windowId }
        });
        await chrome.tabGroups.update(newGroupId, {
          title: ticketId,
          color: hashColor(ticketId),
          collapsed: settings.autoCollapse === true
        });
      }
    }
  }
}
```

> **Note on imports:** `hashColor` is already imported at the top of `src/group.js` from `./domain.js`. Confirm and don't duplicate.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS — 89 tests still green.

- [ ] **Step 4: Commit**

```bash
git add src/group.js
git commit -m "feat(group): runTicketTriage for Jira ticket grouping"
```

---

### Task 4: Menu item and handler in contextmenu.js

**Files:** Modify `src/contextmenu.js`

- [ ] **Step 1: Add new menu ID and import**

Near the other MENU_ID constants in `src/contextmenu.js`, add:

```js
const TICKET_TRIAGE_MENU_ID = 'tidytabs.ticketTriage';
```

At the top, extend the existing `./group.js` import (which already imports `runTriage`) to also import `runTicketTriage`:

```js
import { runTriage, runTicketTriage } from './group.js';
```

- [ ] **Step 2: Add the menu item creation**

In `register`, after the bulk collapse/expand items (`COLLAPSE_ALL_MENU_ID`, `EXPAND_ALL_MENU_ID`), add a separator and the new item BEFORE the tab-context items:

```js
chrome.contextMenus.create({
  id: 'tidytabs.sep4', type: 'separator', contexts: ['action']
});
chrome.contextMenus.create({
  id: TICKET_TRIAGE_MENU_ID,
  title: 'Group by Jira ticket',
  contexts: ['action']
});
```

This goes immediately before the tab-context items (`TAB_MOVE_TO_GROUP_MENU_ID`, `TAB_CLOSE_OTHERS_MENU_ID`).

- [ ] **Step 3: Add the handler**

Add alongside the other handlers:

```js
async function handleTicketTriage() {
  try {
    const settings = await getSettings();
    await runTicketTriage(settings);
  } catch (e) {
    console.error('tidytabs: ticket-triage failed', e);
  }
}
```

- [ ] **Step 4: Update `handleClick` router**

Add a case to the switch in `handleClick`:

```js
case TICKET_TRIAGE_MENU_ID: return handleTicketTriage();
```

Place it next to the other action-context cases (before the tab-context cases).

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS — 89 tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/contextmenu.js
git commit -m "feat(contextmenu): Group by Jira ticket menu item"
```

---

### Task 5: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Reload the extension**

`chrome://extensions` → tidytabs → reload icon.

- [ ] **Step 2: Happy path**

1. Open a tab with title `[FE-3333] Fix login` (or set the page title to that via a local HTML file).
2. Open a second tab with title `[FE-3333] PR #1234 - Fix login`.
3. Right-click toolbar → "Group by Jira ticket".
4. Expected: A group titled `FE-3333` is created containing both tabs.

- [ ] **Step 3: Cross-domain grouping**

1. Domain triage runs first — github.com tab ends up in a `Github` group.
2. Open a tab on jira.atlassian.com with `FE-3333` in its title.
3. Run ticket triage.
4. Expected: The GitHub PR is moved out of `Github` and into `FE-3333` along with the Jira tab.

- [ ] **Step 4: Singletons dropped**

1. Window with one tab whose title is `[FE-9999] Solo work`. No other tabs match.
2. Run ticket triage.
3. Expected: No new group. Silent.

- [ ] **Step 5: Multi-ticket title**

1. Tabs:
   - `[FE-3333] PR A`
   - `[FE-3333] Jira A`
   - `[FE-3334] PR B`
   - `[FE-3333][FE-3334] Shared work`
2. Run ticket triage.
3. Expected: `FE-3333` group contains 3 tabs (PR A, Jira A, Shared). `FE-3334` is a singleton → no group.

- [ ] **Step 6: Re-run merges into existing**

1. Run ticket triage to create `FE-3333` with 2 tabs.
2. Open a new tab with `FE-3333` in its title.
3. Run ticket triage again.
4. Expected: New tab is added to the existing `FE-3333` group.

- [ ] **Step 7: Commit pass**

```bash
git commit --allow-empty -m "test: manual smoke pass for jira-grouping"
```

---

## Done criteria

- `npm test` shows 89 passing.
- Manual steps 2–6 all pass.
- Commits on `main`, ready to push.
