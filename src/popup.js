import * as actions from './actions.js';

const ACTION_MAP = {
  'tidy': actions.handleTidy,
  'tidy-merge': actions.handleTriageMerge,
  'ticket-triage': actions.handleTicketTriage,
  'copy-urls': actions.handleCopyUrls,
  'reload-domain': actions.handleReloadDomain,
  'sort-group-url': actions.handleSortGroupByUrl,
  'sort-group-age': actions.handleSortGroupByAge,
  'move-group-new-window': actions.handleMoveGroupToNewWindow,
  'sort-all-url': actions.handleSortAllGroupsByUrl,
  'sort-all-age': actions.handleSortAllGroupsByAge,
  'collapse-all': () => actions.handleCollapseOrExpandAll(true),
  'expand-all': () => actions.handleCollapseOrExpandAll(false),
  'move-active-tab-to-group': actions.handleMoveActiveTabToDomainGroup,
  'close-others-on-domain': actions.handleCloseOthersOnActiveTabDomain,
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
