# Toggle password visibility on this tab — implementation plan

**Goal:** Add a right-click toolbar menu item that toggles all password inputs on the active tab between hidden and visible.

**Spec:** [docs/superpowers/specs/2026-05-02-toggle-password-visibility-design.md](../specs/2026-05-02-toggle-password-visibility-design.md)

---

## File Structure

| Path | Change |
|---|---|
| `manifest.json` | Add `scripting` + `activeTab` permissions |
| `src/contextmenu.js` | Add menu ID, register, handler, route |

No new files. No tests.

---

## Tasks

### Task 1: Manifest — add permissions

**Files:** Modify `manifest.json`

- [ ] **Step 1: Update permissions array**

In `manifest.json`, change the `permissions` array to include `scripting` and `activeTab`:

```json
"permissions": ["tabs", "tabGroups", "storage", "contextMenus", "clipboardWrite", "offscreen", "scripting", "activeTab"]
```

All other manifest fields untouched.

- [ ] **Step 2: Verify tests still pass**

Run: `npm test`
Expected: 102 tests still passing.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add scripting and activeTab permissions"
```

---

### Task 2: Menu item and handler

**Files:** Modify `src/contextmenu.js`

- [ ] **Step 1: Add new menu ID constant**

In `src/contextmenu.js`, near the other MENU_ID constants, add:

```js
const PASSWORD_TOGGLE_MENU_ID = 'tidytabs.togglePasswordVisibility';
```

- [ ] **Step 2: Add menu item registration**

In the `register` function, AFTER the existing `TICKET_TRIAGE_MENU_ID` creation and BEFORE the tab-context items (`TAB_MOVE_TO_GROUP_MENU_ID`, `TAB_CLOSE_OTHERS_MENU_ID`), insert:

```js
chrome.contextMenus.create({
  id: 'tidytabs.sep5', type: 'separator', contexts: ['action']
});
chrome.contextMenus.create({
  id: PASSWORD_TOGGLE_MENU_ID,
  title: 'Toggle password visibility on this tab',
  contexts: ['action']
});
```

- [ ] **Step 3: Add the handler function**

Add this function alongside the other handlers in `src/contextmenu.js`:

```js
async function handleTogglePasswordVisibility() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || !activeTab.id) return;
    if (typeof activeTab.url !== 'string' || !/^https?:\/\//.test(activeTab.url)) return;

    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => {
        const passwords = document.querySelectorAll('input[type="password"]');
        if (passwords.length > 0) {
          passwords.forEach(i => {
            i.type = 'text';
            i.setAttribute('data-tidytabs-was-password', 'true');
          });
          return { revealed: passwords.length, restored: 0 };
        }
        const previouslyRevealed = document.querySelectorAll('input[data-tidytabs-was-password]');
        previouslyRevealed.forEach(i => {
          i.type = 'password';
          i.removeAttribute('data-tidytabs-was-password');
        });
        return { revealed: 0, restored: previouslyRevealed.length };
      }
    });
  } catch (e) {
    console.error('tidytabs: toggle-password-visibility failed', e);
  }
}
```

- [ ] **Step 4: Update `handleClick` router**

Add a case to the `switch` in `handleClick`:

```js
case PASSWORD_TOGGLE_MENU_ID: return handleTogglePasswordVisibility();
```

Place it among the action-context cases (before the tab-context cases for clarity).

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 102 tests still passing.

- [ ] **Step 6: Commit**

```bash
git add src/contextmenu.js
git commit -m "feat(contextmenu): toggle password visibility on this tab"
```

---

### Task 3: Manual smoke test

**Files:** None modified.

- [ ] **Step 1: Reload the extension**

`chrome://extensions` → tidytabs → reload icon. Confirm no errors.

- [ ] **Step 2: Reveal**

1. Open any login page with a password field (gmail.com, github.com login, etc.).
2. Click the password field and type some characters.
3. Right-click tidytabs icon → "Toggle password visibility on this tab".
4. Expected: dotted password becomes plain text.

- [ ] **Step 3: Restore**

1. Click the menu item again.
2. Expected: plain text reverts to dotted password mask.

- [ ] **Step 4: Page with no password fields**

1. Focus a page with no password inputs (any logged-in page).
2. Click the menu item.
3. Expected: silent no-op.

- [ ] **Step 5: Restricted URL**

1. Focus a `chrome://extensions` tab.
2. Click the menu item.
3. Expected: nothing happens. Service worker console may show an injection error (caught and logged).

- [ ] **Step 6: Commit pass**

```bash
git commit --allow-empty -m "test: manual smoke pass for toggle-password-visibility"
```

---

## Done criteria

- `npm test` shows 102 passing.
- Manual steps 2–5 all pass.
- Commits on `main`, ready to push.
