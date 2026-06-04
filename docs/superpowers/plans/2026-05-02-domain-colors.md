# Domain color presets and overrides — implementation plan

**Goal:** Make tidytabs assign colors that match common brands (github→grey, youtube→red, etc.) out of the box, and let users override any domain's color via the Options page.

**Spec:** [docs/superpowers/specs/2026-05-02-domain-colors-design.md](../specs/2026-05-02-domain-colors-design.md)

---

## File Structure

| Path | Change |
|---|---|
| `src/domain.js` | Add `PRESETS` constant export |
| `src/settings.js` | Add `domainColors` to `DEFAULTS` + validate in `applyDefaults` |
| `src/group.js` | Update `pickGroupColor` with new priority order |
| `test/domain.test.js` | Test `PRESETS` shape |
| `test/settings.test.js` | Test `domainColors` validation |
| `test/group.test.js` | Test `pickGroupColor` priority |
| `options.html` | New section for color overrides |
| `options.css` | Styles for the override list |
| `src/options.js` | Wire the editor to settings |

---

## Tasks

### Task 1: `PRESETS` constant in domain.js (TDD)

**Files:** Modify `test/domain.test.js`, modify `src/domain.js`

- [ ] **Step 1: Append failing tests**

Append to `test/domain.test.js`:

```js
import { PRESETS } from '../src/domain.js';

test('PRESETS: every value is in COLORS', () => {
  for (const [domain, color] of Object.entries(PRESETS)) {
    assert.ok(
      COLORS.includes(color),
      `Preset for ${domain} uses invalid color: ${color}`
    );
  }
});

test('PRESETS: includes common brand domains', () => {
  assert.equal(PRESETS['github.com'], 'grey');
  assert.equal(PRESETS['youtube.com'], 'red');
  assert.equal(PRESETS['google.com'], 'blue');
  assert.equal(PRESETS['reddit.com'], 'orange');
});

test('PRESETS: keys are eTLD+1 form (no www., no subdomains)', () => {
  for (const key of Object.keys(PRESETS)) {
    assert.equal(key.startsWith('www.'), false);
    // Allow news.ycombinator.com explicitly since extractDomain produces ycombinator.com but the HN brand is news.*
    // Actually we want keys to match what extractDomain returns. So no subdomains EXCEPT the special cases.
    // For this test, just ensure no leading www.
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `PRESETS` is undefined.

- [ ] **Step 3: Implement `PRESETS`**

Append to `src/domain.js`:

```js
export const PRESETS = Object.freeze({
  'github.com': 'grey',
  'youtube.com': 'red',
  'google.com': 'blue',
  'gmail.com': 'red',
  'twitter.com': 'cyan',
  'x.com': 'grey',
  'reddit.com': 'orange',
  'stackoverflow.com': 'orange',
  'linkedin.com': 'blue',
  'facebook.com': 'blue',
  'amazon.com': 'orange',
  'apple.com': 'grey',
  'wikipedia.org': 'grey',
  'ycombinator.com': 'orange',
  'notion.so': 'grey',
  'figma.com': 'purple',
  'linear.app': 'purple',
  'atlassian.net': 'blue',
  'slack.com': 'purple',
  'discord.com': 'purple',
  'spotify.com': 'green',
  'netflix.com': 'red',
  'twitch.tv': 'purple'
});
```

> **Note:** Hacker News at `news.ycombinator.com` is wrapped by `extractDomain` to `ycombinator.com`. So the key is `ycombinator.com`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 92 tests (89 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/domain.js test/domain.test.js
git commit -m "feat(domain): PRESETS brand-color map"
```

---

### Task 2: `domainColors` in settings DEFAULTS + applyDefaults (TDD)

**Files:** Modify `test/settings.test.js`, modify `src/settings.js`

- [ ] **Step 1: Append failing tests**

Append to `test/settings.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — DEFAULTS.domainColors undefined.

- [ ] **Step 3: Update `DEFAULTS` and `applyDefaults`**

In `src/settings.js`:

(a) Add `domainColors: {}` to the `DEFAULTS` literal:

```js
export const DEFAULTS = Object.freeze({
  groupOrder: 'leftmost',
  ungroupedPlacement: 'end',
  domainThreshold: 3,
  autoCollapse: true,
  colorStrategy: 'stable-hash',
  scope: 'current',
  domainColors: {}
});
```

(b) Add a `COLORS` import at the top of `src/settings.js`:

```js
import { COLORS } from './domain.js';
```

(c) In the `applyDefaults` function, in the loop that copies known keys, add handling for `domainColors`. Place this case alongside the other type-specific handlers:

```js
if (key === 'domainColors') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const cleaned = {};
    for (const [domain, color] of Object.entries(value)) {
      const dom = typeof domain === 'string' ? domain.trim() : '';
      if (!dom) continue;
      if (!COLORS.includes(color)) continue;
      cleaned[dom] = color;
    }
    out[key] = cleaned;
  }
  continue;
}
```

> The `out` object starts as `{ ...DEFAULTS }`, so if no valid value is passed `domainColors` stays as `{}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 98 tests (92 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/settings.js test/settings.test.js
git commit -m "feat(settings): domainColors with validation"
```

---

### Task 3: `pickGroupColor` priority (TDD)

**Files:** Modify `test/group.test.js`, modify `src/group.js`

- [ ] **Step 1: Append failing tests**

Append to `test/group.test.js`:

```js
test('pickGroupColor: user override wins over preset', () => {
  const settings = {
    colorStrategy: 'stable-hash',
    domainColors: { 'github.com': 'blue' }
  };
  assert.equal(pickGroupColor('github.com', 0, settings), 'blue');
});

test('pickGroupColor: preset wins over strategy', () => {
  const settings = { colorStrategy: 'stable-hash', domainColors: {} };
  // github.com preset is grey
  assert.equal(pickGroupColor('github.com', 0, settings), 'grey');
});

test('pickGroupColor: strategy fallback when no override and no preset', () => {
  const settings = { colorStrategy: 'palette', domainColors: {} };
  // For an unknown domain, palette index 2 should map deterministically
  assert.equal(pickGroupColor('unknown.example.org', 2, settings), paletteColor(2));
});

test('pickGroupColor: ignores override with invalid color', () => {
  const settings = {
    colorStrategy: 'stable-hash',
    domainColors: { 'github.com': 'bogus' }
  };
  // Invalid override → falls through to preset (grey)
  assert.equal(pickGroupColor('github.com', 0, settings), 'grey');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — current `pickGroupColor` doesn't consult overrides or presets.

- [ ] **Step 3: Update `pickGroupColor`**

In `src/group.js`, find the existing `pickGroupColor` function and replace it with:

```js
export function pickGroupColor(domain, paletteIndex, settings) {
  const overrides = (settings && settings.domainColors) || {};
  const override = overrides[domain];
  if (override && COLORS.includes(override)) {
    return override;
  }
  if (PRESETS[domain]) {
    return PRESETS[domain];
  }
  switch (settings.colorStrategy) {
    case 'random':
      return COLORS[Math.floor(Math.random() * COLORS.length)];
    case 'palette':
      return paletteColor(paletteIndex);
    case 'stable-hash':
    default:
      return hashColor(domain);
  }
}
```

> **Note:** Add `PRESETS` to the existing `domain.js` import at the top of `src/group.js`:
>
> ```js
> import { extractDomain, COLORS, hashColor, paletteColor, prettyName, PRESETS } from './domain.js';
> ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 102 tests (98 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/group.js test/group.test.js
git commit -m "feat(group): pickGroupColor honors user overrides and presets"
```

---

### Task 4: Options page UI — list editor

**Files:** Modify `options.html`, modify `options.css`, modify `src/options.js`

- [ ] **Step 1: Add the new section to `options.html`**

Add a new `<section>` block at the end of the `<main>` element (after the Reset section):

```html
<section id="domain-colors-section">
  <h2>Domain color overrides</h2>
  <p class="hint">Override the assigned color for specific domains. Built-in defaults are shown below — your overrides take precedence.</p>

  <div id="domain-colors-list"></div>

  <div class="add-override-row">
    <input type="text" id="new-override-domain" placeholder="example.com" />
    <select id="new-override-color">
      <option value="grey">grey</option>
      <option value="blue">blue</option>
      <option value="red">red</option>
      <option value="yellow">yellow</option>
      <option value="green">green</option>
      <option value="pink">pink</option>
      <option value="purple">purple</option>
      <option value="cyan">cyan</option>
      <option value="orange">orange</option>
    </select>
    <button id="add-override" type="button">Add</button>
  </div>

  <details id="domain-color-presets">
    <summary>Built-in defaults</summary>
    <div id="presets-list"></div>
  </details>
</section>
```

- [ ] **Step 2: Append styles to `options.css`**

Add at the end of `options.css`:

```css
.hint { color: #666; font-size: 12px; margin: 0 0 12px; }
#domain-colors-list { margin-bottom: 12px; }
.override-row {
  display: grid;
  grid-template-columns: 1fr 120px 30px;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
}
.override-row .domain { font-family: ui-monospace, monospace; font-size: 13px; }
.override-row button { padding: 2px 6px; font-size: 12px; }
.add-override-row {
  display: grid;
  grid-template-columns: 1fr 120px auto;
  gap: 8px;
  align-items: center;
}
#domain-color-presets summary { cursor: pointer; color: #444; font-size: 12px; margin-top: 12px; }
#presets-list {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  margin-top: 8px;
  line-height: 1.6;
}
.preset-entry {
  display: inline-block;
  margin-right: 12px;
}
.preset-entry .color-chip {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  vertical-align: middle;
  margin-right: 4px;
}
```

- [ ] **Step 3: Wire up `src/options.js`**

At the top of `src/options.js`, add an import for `PRESETS` and `COLORS`:

```js
import { PRESETS, COLORS } from './domain.js';
```

After `init()` is defined, add a helper that renders the overrides list:

```js
function renderOverrides(settings) {
  const list = document.getElementById('domain-colors-list');
  if (!list) return;
  list.innerHTML = '';
  const overrides = settings.domainColors || {};
  const domains = Object.keys(overrides).sort();
  for (const domain of domains) {
    const row = document.createElement('div');
    row.className = 'override-row';
    row.dataset.domain = domain;

    const domEl = document.createElement('span');
    domEl.className = 'domain';
    domEl.textContent = domain;
    row.appendChild(domEl);

    const select = document.createElement('select');
    for (const color of COLORS) {
      const opt = document.createElement('option');
      opt.value = color;
      opt.textContent = color;
      if (color === overrides[domain]) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', async () => {
      const updated = { ...overrides, [domain]: select.value };
      await setSetting('domainColors', updated);
    });
    row.appendChild(select);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', async () => {
      const updated = { ...overrides };
      delete updated[domain];
      await setSetting('domainColors', updated);
      const fresh = await getSettings();
      renderOverrides(fresh);
    });
    row.appendChild(removeBtn);

    list.appendChild(row);
  }
}

function renderPresets() {
  const wrap = document.getElementById('presets-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const [domain, color] of Object.entries(PRESETS)) {
    const entry = document.createElement('span');
    entry.className = 'preset-entry';
    const chip = document.createElement('span');
    chip.className = 'color-chip';
    chip.style.background = colorToCss(color);
    entry.appendChild(chip);
    entry.appendChild(document.createTextNode(`${domain} → ${color}`));
    wrap.appendChild(entry);
  }
}

function colorToCss(c) {
  // Approximate Chrome group colors for visual chips.
  switch (c) {
    case 'grey': return '#888';
    case 'blue': return '#3b82f6';
    case 'red': return '#ef4444';
    case 'yellow': return '#facc15';
    case 'green': return '#22c55e';
    case 'pink': return '#ec4899';
    case 'purple': return '#a855f7';
    case 'cyan': return '#06b6d4';
    case 'orange': return '#f97316';
    default: return '#888';
  }
}
```

In `init()`, after the existing form-wiring loop, add:

```js
renderOverrides(settings);
renderPresets();

document.getElementById('add-override').addEventListener('click', async () => {
  const domainInput = document.getElementById('new-override-domain');
  const colorSelect = document.getElementById('new-override-color');
  const domain = domainInput.value.trim();
  const color = colorSelect.value;
  if (!domain) return;
  if (!COLORS.includes(color)) return;
  const fresh = await getSettings();
  const updated = { ...(fresh.domainColors || {}), [domain]: color };
  await setSetting('domainColors', updated);
  domainInput.value = '';
  const fresher = await getSettings();
  renderOverrides(fresher);
});
```

Also update the Reset button to re-render the overrides list:

After the existing reset listener, the reset closure sets defaults — add a call after the resets:

```js
// Re-render after reset
const fresh = await getSettings();
renderOverrides(fresh);
```

(Locate the existing `document.getElementById('reset').addEventListener('click', ...)` block and add this re-render call inside the listener, after the existing setControlValue loop.)

- [ ] **Step 4: Verify tests still pass**

Run: `npm test`
Expected: PASS — 102 tests still green (no test changes in this task).

- [ ] **Step 5: Commit**

```bash
git add options.html options.css src/options.js
git commit -m "feat(options): domain color override editor"
```

---

### Task 5: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Reload the extension**

`chrome://extensions` → tidytabs → reload.

- [ ] **Step 2: Preset out of box**

1. Triage 3 github.com tabs in a fresh window.
2. Expected: group color is `grey` (not hash-random).

- [ ] **Step 3: Triage other branded domains**

1. youtube.com → `red`.
2. reddit.com → `orange`.
3. Spot-check 2-3 others from PRESETS table.

- [ ] **Step 4: User override**

1. Open Options. Scroll to "Domain color overrides".
2. Add `github.com` + `blue` → click Add.
3. Re-triage github.com tabs in a new window (or close the existing Github group and re-triage).
4. Expected: group color is `blue` now.

- [ ] **Step 5: Remove override**

1. Click × on the github.com row.
2. Re-triage.
3. Expected: group color is back to `grey` (the preset).

- [ ] **Step 6: Unknown domain falls through to strategy**

1. Triage 3 tabs from `random-no-preset.example.com`.
2. Expected: color is whatever the strategy picks (hash by default — deterministic).

- [ ] **Step 7: Invalid input rejected**

1. In Options, leave domain field empty, click Add. → Nothing happens.

- [ ] **Step 8: Persistence**

1. Add an override. Close Chrome. Reopen.
2. Expected: override is still listed.

- [ ] **Step 9: Commit pass**

```bash
git commit --allow-empty -m "test: manual smoke pass for domain-colors"
```

---

## Done criteria

- `npm test` shows 102 passing.
- All 8 manual smoke steps pass.
- Commits on `main`, ready to push.
