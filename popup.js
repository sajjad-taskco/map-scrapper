const $ = (id) => document.getElementById(id);

const COLUMNS = ['query', 'name', 'category', 'rating', 'reviews', 'address', 'phone', 'website', 'emails', 'plus_code', 'latitude', 'longitude', 'cid', 'sponsored', 'url'];

let results = [];

function render(state) {
  if (!state) return;
  results = state.results || [];
  $('n').textContent = results.length;
  $('seenCount').textContent = state.seenCount || 0;
  $('status').textContent = state.log || (state.status === 'running' ? 'Running...' : 'Idle');
  const running = state.status === 'running';
  document.body.classList.toggle('running', running);
  $('badge').textContent = running ? 'Running' : 'Idle';
  $('start').disabled = running;
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
  const { state, prefs } = await chrome.storage.local.get(['state', 'prefs']);
  if (prefs) {
    $('queries').value = prefs.queries || '';
    $('detailed').checked = prefs.detailed !== false;
    $('emails').checked = !!prefs.emails;
    $('skipSeen').checked = prefs.skipSeen !== false;
  }
  render(state);
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.state) render(changes.state.newValue);
});

$('start').addEventListener('click', async () => {
  const queries = $('queries').value.split('\n').map((q) => q.trim()).filter(Boolean);
  const opts = {
    detailed: $('detailed').checked,
    emails: $('emails').checked,
    skipSeen: $('skipSeen').checked,
  };
  await chrome.storage.local.set({ prefs: { queries: $('queries').value, ...opts } });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!queries.length && !(tab.url || '').startsWith('https://www.google.com/maps')) {
    $('status').textContent = 'Enter a query, or search on Google Maps first and then press Start.';
    return;
  }
  chrome.runtime.sendMessage({ type: 'job', queries, opts, tabId: tab.id });
});

$('stop').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'stop' }));

$('clear').addEventListener('click', () => {
  if (confirm('Delete all results? (History is kept)')) chrome.runtime.sendMessage({ type: 'clear' });
});

$('resetSeen').addEventListener('click', () => {
  if (confirm('Clear history? Previously scraped places will be scraped again next time.')) chrome.runtime.sendMessage({ type: 'resetSeen' });
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
