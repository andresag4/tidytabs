import { DEFAULTS, getSettings, setSetting, resetSettings } from './settings.js';

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

  document.getElementById('reset').addEventListener('click', async () => {
    if (!window.confirm('Reset all tidytabs settings to defaults?')) return;
    await resetSettings();
    for (const key of Object.keys(DEFAULTS)) setControlValue(key, DEFAULTS[key]);
  });
}

init();
