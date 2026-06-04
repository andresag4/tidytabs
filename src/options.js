import { DEFAULTS, getSettings, setSetting, resetSettings } from './settings.js';
import { PRESETS, COLORS } from './domain.js';

function showSaved(section) {
  const el = section.querySelector('.saved');
  if (!el) return;
  el.hidden = false;
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.hidden = true; }, 200);
  }, 1200);
}

function setControlValue(key, value) {
  if (key === 'autoCollapse') {
    const cb = document.querySelector(`input[name="${key}"]`);
    if (cb) cb.checked = !!value;
    return;
  }
  if (key === 'domainThreshold') {
    const range = document.querySelector(`input[name="${key}"]`);
    if (!range) return;
    range.value = String(value);
    const output = range.parentElement.querySelector('output');
    if (output) output.textContent = String(value);
    return;
  }
  const radio = document.querySelector(`input[name="${key}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function readControlValue(key, control) {
  if (key === 'autoCollapse') return control.checked;
  if (key === 'domainThreshold') return Number(control.value);
  return control.value;
}

async function init() {
  const settings = await getSettings();
  for (const key of Object.keys(DEFAULTS)) setControlValue(key, settings[key]);

  for (const section of document.querySelectorAll('section[data-key]')) {
    const key = section.dataset.key;
    section.addEventListener('change', async (event) => {
      const target = event.target;
      if (!target.matches('input')) return;
      const value = readControlValue(key, target);
      await setSetting(key, value);
      if (key === 'domainThreshold') {
        const output = target.parentElement.querySelector('output');
        if (output) output.textContent = String(value);
      }
      showSaved(section);
    });
    section.addEventListener('input', (event) => {
      // Live label update for the slider while dragging.
      if (event.target.matches('input[type="range"]')) {
        const output = event.target.parentElement.querySelector('output');
        if (output) output.textContent = event.target.value;
      }
    });
  }

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

  document.getElementById('reset').addEventListener('click', async () => {
    if (!window.confirm('Reset all tidytabs settings to defaults?')) return;
    await resetSettings();
    for (const key of Object.keys(DEFAULTS)) setControlValue(key, DEFAULTS[key]);
    // Re-render after reset
    const fresh = await getSettings();
    renderOverrides(fresh);
  });
}

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

init();
