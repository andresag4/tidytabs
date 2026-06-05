# Toggle password visibility on this tab — feature spec

**Status:** Design approved 2026-05-02
**Type:** Additive feature for the existing tidytabs Chrome extension
**Parent spec:** [2026-05-02-tab-triage-design.md](2026-05-02-tab-triage-design.md)

## Goal

A right-click toolbar menu item that toggles all `<input type="password">` fields on the active tab between hidden (dots) and visible (plain text). Useful for verifying typed-in passwords, debugging forms, and during pair programming.

## Non-goals

- No persistent state across page navigation. Reload wipes the toggle.
- No keyboard shortcut.
- No per-input toggle. All-or-nothing per page.
- No persistence to the page (no monkey-patching new inputs that appear later).

## Behavior

### Trigger

Right-click the tidytabs toolbar icon → new item at the bottom of the action menu:

**"Toggle password visibility on this tab"**

Placed after the existing "Group by Jira ticket" item (with a separator), before the tab-context items.

### Toggle semantics

The action is **symmetric**. The same click toggles both directions:

1. Query all `<input type="password">` on the current page.
2. **If any exist:**
   - Flip each to `type="text"`.
   - Add `data-tidytabs-was-password="true"` to each (so we can restore later).
3. **If none exist** (the user already revealed):
   - Query all `<input data-tidytabs-was-password>`.
   - Flip each back to `type="password"`.
   - Remove the marker attribute.

Net effect: every click toggles the state.

### Edge cases

- **Active tab is chrome://, file://, view-source:, devtools://, etc.** → `chrome.scripting.executeScript` rejects with an error. Caught and logged; user-visible behavior is silent no-op.
- **Page has no password inputs and no markers** → both branches no-op. Safe.
- **Page reloads between clicks** → markers wiped; next click flips fresh password inputs to text. Acceptable.
- **Dynamic forms (passwords appear after reveal click)** → not toggled by the marker pass on a later click. The user can click again to flip those new ones to text. Acceptable for v1.
- **Iframes** → not touched by default. The injected script runs only in the main frame. Acceptable.

## Permissions delta

Added to `manifest.json`:

- `scripting` — required to call `chrome.scripting.executeScript`.
- `activeTab` — grants ephemeral access to the active tab on user-gesture invocations (like a context menu click). Avoids needing broad `<all_urls>` host permissions.

## Architecture

### Modified files

| Path | Change |
|---|---|
| `manifest.json` | Add `scripting` and `activeTab` to permissions. |
| `src/contextmenu.js` | Add menu ID, register the item with a separator, add handler, route in `handleClick`. |

No new files. No test changes.

### `handleTogglePasswordVisibility`

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

### Why `activeTab` instead of `host_permissions`

`activeTab` gives the extension temporary, user-gesture-scoped access to the current tab — only when the user explicitly clicks the action button or one of its context menu items. This is the most restrictive scope possible while still letting the feature work. No broad host permission is needed.

## Testing

### Unit tests

None — the injected function runs against a real browser DOM. No useful unit-test seam.

Existing 102 tests must remain green.

### Manual smoke test

1. **Reveal:** Open `gmail.com` (or any login page). Click the password field, type a few characters. Right-click tidytabs icon → "Toggle password visibility on this tab". → Password becomes plain text.
2. **Restore:** Click the menu item again. → Plain text reverts to dotted password mask.
3. **No password inputs:** Open a page with no password fields (e.g., your bank's home page after login). Run the action. → Silent no-op (no error in service worker console).
4. **Page reload:** Reveal, then reload the page. Run the action. → Reveals afresh (markers were lost with the reload, so this looks like a fresh reveal).
5. **Restricted URL:** Focus a `chrome://settings` tab. Run the action. → Nothing happens. Console may log a permission error.

## Out of scope

- Reveal in iframes.
- Persistent across navigation.
- Keyboard shortcut.
- A "lock everything" mode.
