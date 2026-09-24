import * as actions from './actions.js';

const ACTION_MAP = {
  'tidy': actions.handleTidy,
  'tidy-merge': actions.handleTriageMerge,
  'ticket-triage': actions.handleTicketTriage,
  'copy-urls': actions.handleCopyUrls,
  'reload-domain': actions.handleReloadDomain,
  'copy-group-urls': actions.handleCopyGroupUrls,
  'reload-group': actions.handleReloadGroup,
  'move-group-new-window': actions.handleMoveGroupToNewWindow,
  'collapse-all': () => actions.handleCollapseOrExpandAll(true),
  'expand-all': () => actions.handleCollapseOrExpandAll(false),
  'toggle-passwords': actions.handleTogglePasswordVisibility
};

for (const btn of document.querySelectorAll('button[data-action]')) {
  btn.addEventListener('click', async () => {
    const name = btn.dataset.action;
    const fn = ACTION_MAP[name];
    if (!fn) return;
    try {
      await fn();
    } finally {
      window.close();
    }
  });
}

const settingsLink = document.getElementById('open-settings');
if (settingsLink) {
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });
}
