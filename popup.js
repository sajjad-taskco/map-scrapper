const $ = (id) => document.getElementById(id);

const COLUMNS = ['query', 'name', 'category', 'rating', 'reviews', 'address', 'phone', 'website', 'emails', 'plus_code', 'latitude', 'longitude', 'cid', 'sponsored', 'url'];

let results = [];

function render(state) {
  if (!state) return;
  results = state.results || [];
  $('n').textContent = results.length;
  $('status').textContent = state.log || (state.status === 'running' ? 'Running...' : 'Idle');
  const ss = $('sheetStatus');
  ss.textContent = state.sheetLog || '';
  ss.className = /error|nai/i.test(state.sheetLog || '') ? 'error' : '';
  $('start').disabled = state.status === 'running';
  $('stop').disabled = state.status !== 'running';

  const ul = $('preview');
  ul.innerHTML = '';
  for (const r of results.slice(-20).reverse()) {
    const li = document.createElement('li');
    li.textContent = r.name;
    const small = document.createElement('small');
    small.textContent = [r.rating && `★ ${r.rating}`, r.phone, r.address].filter(Boolean).join(' · ');
    li.appendChild(small);
    ul.appendChild(li);
  }
}

async function init() {
  const { state, prefs, sheet } = await chrome.storage.local.get(['state', 'prefs', 'sheet']);
  if (prefs) {
    $('queries').value = prefs.queries || '';
    $('max').value = prefs.max || 100;
    $('detailed').checked = prefs.detailed !== false;
    $('emails').checked = !!prefs.emails;
  }
  if (sheet) {
    $('sheetId').value = sheet.input || '';
    $('scriptUrl').value = sheet.scriptUrl || '';
    $('secret').value = sheet.secret || '';
    $('autoSheet').checked = !!sheet.auto;
    if (sheet.auto) $('sheetBox').open = true;
  }
  render(state);
}

// Accepts a bare ID or a full docs.google.com/spreadsheets/d/<id>/edit#gid=<gid> link.
function parseSheet(input) {
  const s = input.trim();
  const id = (s.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || s;
  const gid = (s.match(/gid=(\d+)/) || [])[1] || '';
  return { sheetId: id, gid };
}

function saveSheetConfig() {
  const input = $('sheetId').value;
  return chrome.storage.local.set({
    sheet: {
      input,
      ...parseSheet(input),
      scriptUrl: $('scriptUrl').value.trim(),
      secret: $('secret').value,
      auto: $('autoSheet').checked,
    },
  });
}

for (const id of ['sheetId', 'scriptUrl', 'secret', 'autoSheet']) {
  $(id).addEventListener('change', saveSheetConfig);
}

$('testSheet').addEventListener('click', async () => {
  await saveSheetConfig();
  $('sheetStatus').textContent = 'Checking...';
  chrome.runtime.sendMessage({ type: 'testSheet' });
});

$('syncSheet').addEventListener('click', async () => {
  await saveSheetConfig();
  chrome.runtime.sendMessage({ type: 'syncSheet' });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.state) render(changes.state.newValue);
});

$('start').addEventListener('click', async () => {
  const queries = $('queries').value.split('\n').map((q) => q.trim()).filter(Boolean);
  const opts = {
    max: Math.max(1, parseInt($('max').value, 10) || 100),
    detailed: $('detailed').checked,
    emails: $('emails').checked,
  };
  await chrome.storage.local.set({ prefs: { queries: $('queries').value, ...opts } });
  await saveSheetConfig();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!queries.length && !(tab.url || '').startsWith('https://www.google.com/maps')) {
    $('status').textContent = 'Query lekho, othoba age Google Maps e search kore tarpor Start dao.';
    return;
  }
  chrome.runtime.sendMessage({ type: 'job', queries, opts, tabId: tab.id });
});

$('stop').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'stop' }));

$('clear').addEventListener('click', () => {
  if (confirm('Sob result muche felbo?')) chrome.runtime.sendMessage({ type: 'clear' });
});

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

$('csv').addEventListener('click', () => {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [COLUMNS.join(','), ...results.map((r) => COLUMNS.map((c) => esc(r[c])).join(','))];
  // BOM so Excel shows Bangla/Unicode correctly
  download(`google-maps-${stamp()}.csv`, '﻿' + rows.join('\n'), 'text/csv;charset=utf-8');
});

$('json').addEventListener('click', () => {
  download(`google-maps-${stamp()}.json`, JSON.stringify(results, null, 2), 'application/json');
});

init();
