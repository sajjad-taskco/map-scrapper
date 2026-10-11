// Job queue: runs each search query in turn, stores results, and looks up emails from websites.

const DEFAULT_STATE = {
  status: 'idle', // idle | running
  tabId: null,
  queue: [], // remaining queries
  current: '',
  pendingStart: false,
  opts: { max: 100, detailed: true, emails: false },
  results: [],
  log: '',
  sheetPending: [], // rows waiting to be sent to Google Sheet
  sheetLog: '',
};

let state = null;

async function load() {
  if (state) return state;
  const { state: saved } = await chrome.storage.local.get('state');
  state = { ...DEFAULT_STATE, ...(saved || {}) };
  return state;
}

function save() {
  return chrome.storage.local.set({ state });
}

function mapsUrl(query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
}

async function nextQuery() {
  await load();
  if (state.status !== 'running') return;
  const query = state.queue.shift();
  if (query === undefined) {
    state.status = 'idle';
    state.current = '';
    state.log = `Shesh! Mot ${state.results.length} ta result.`;
    await save();
    return;
  }
  state.current = query;
  state.pendingStart = true;
  state.log = `Searching: ${query}`;
  await save();
  await chrome.tabs.update(state.tabId, { url: mapsUrl(query), active: true });
}

// ---------- Email lookup ----------

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|example\.com|sentry|wixpress|@2x/i;

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return '';
    return await res.text();
  } catch (_) {
    return '';
  } finally {
    clearTimeout(t);
  }
}

function extractEmails(html) {
  const found = new Set();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of html.match(EMAIL_RE) || []) found.add(m.toLowerCase());
  return [...found].filter((e) => !BAD_EMAIL.test(e));
}

async function findEmails(website) {
  let emails = extractEmails(await fetchText(website));
  if (!emails.length) {
    for (const path of ['/contact', '/contact-us', '/about']) {
      try {
        emails = extractEmails(await fetchText(new URL(path, website).href));
      } catch (_) {}
      if (emails.length) break;
    }
  }
  return emails.slice(0, 5).join('; ');
}

// ---------- Google Sheet (via Apps Script web app) ----------

async function sheetConfig() {
  const { sheet } = await chrome.storage.local.get('sheet');
  return sheet && sheet.sheetId && sheet.scriptUrl ? sheet : null;
}

async function postSheet(cfg, rows) {
  const res = await fetch(cfg.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: cfg.secret, sheetId: cfg.sheetId, gid: cfg.gid, rows }),
  });
  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch (_) {
    return { ok: false, error: `Apps Script theke JSON ashe nai (HTTP ${res.status}). URL/deploy access check koro.` };
  }
}

let flushTimer = null;
let flushing = false;

async function queueForSheet(items, force = false) {
  const cfg = await sheetConfig();
  if (!cfg || (!cfg.auto && !force)) return;
  await load();
  state.sheetPending.push(...items);
  await save();
  clearTimeout(flushTimer);
  if (state.sheetPending.length >= 10 || force) flushSheet();
  else flushTimer = setTimeout(flushSheet, 4000);
}

async function flushSheet() {
  if (flushing) return;
  await load();
  const cfg = await sheetConfig();
  if (!cfg || !state.sheetPending.length) return;
  flushing = true;
  let ok = false;
  const batch = state.sheetPending.slice(0, 200);
  try {
    const res = await postSheet(cfg, batch);
    if (res.ok) {
      ok = true;
      state.sheetPending.splice(0, batch.length);
      state.sheetTotal = (state.sheetTotal || 0) + res.added;
      state.sheetLog = `Sheet "${res.sheet}" e ${state.sheetTotal} ta row save hoyeche`;
    } else {
      state.sheetLog = `Sheet error: ${res.error}`;
    }
  } catch (e) {
    state.sheetLog = `Sheet error: ${e.message}`;
  } finally {
    flushing = false;
    await save();
  }
  // Rows that failed stay in sheetPending and are retried on the next flush.
  if (ok && state.sheetPending.length) flushSheet();
}

// ---------- Messages ----------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    await load();

    switch (msg.type) {
      case 'ready': {
        // Content script loaded in a tab; start it if this is our job tab.
        if (state.status === 'running' && state.pendingStart && sender.tab && sender.tab.id === state.tabId) {
          state.pendingStart = false;
          await save();
          reply({ start: true, opts: { ...state.opts, query: state.current } });
        } else reply({ start: false });
        break;
      }

      case 'job': {
        state.opts = msg.opts;
        state.tabId = msg.tabId;
        state.status = 'running';
        if (msg.queries.length) {
          state.queue = [...msg.queries];
          await save();
          await nextQuery();
        } else {
          // No query typed: scrape the Maps search already open in this tab.
          state.queue = [];
          state.current = '';
          state.log = 'Current page scrape hocche...';
          await save();
          chrome.tabs.sendMessage(msg.tabId, { type: 'start', opts: { ...state.opts, query: '' } }).catch(async () => {
            state.status = 'idle';
            state.log = 'Ei tab e Google Maps search page khola nei (page reload kore abar try koro).';
            await save();
          });
        }
        reply({ ok: true });
        break;
      }

      case 'stop': {
        state.status = 'idle';
        state.queue = [];
        state.pendingStart = false;
        state.log = `Stopped. Mot ${state.results.length} ta result.`;
        await save();
        if (state.tabId != null) chrome.tabs.sendMessage(state.tabId, { type: 'stop' }).catch(() => {});
        flushSheet();
        reply({ ok: true });
        break;
      }

      case 'clear': {
        state.results = [];
        state.log = '';
        state.sheetTotal = 0;
        state.sheetLog = '';
        await save();
        reply({ ok: true });
        break;
      }

      case 'item': {
        const item = msg.item;
        const key = item.cid || item.url;
        if (!state.results.some((r) => (r.cid || r.url) === key)) {
          state.results.push(item);
          state.log = `${state.current || 'Scraping'} — ${state.results.length} ta result`;
          await save();
          if (state.opts.emails && item.website) {
            // Send to the sheet only after the email lookup, so the row is complete.
            findEmails(item.website).then(async (emails) => {
              const r = state.results.find((x) => (x.cid || x.url) === key) || item;
              if (emails) {
                r.emails = emails;
                await save();
              }
              queueForSheet([r]);
            });
          } else {
            queueForSheet([item]);
          }
        }
        reply({ ok: true });
        break;
      }

      case 'testSheet': {
        const cfg = await sheetConfig();
        if (!cfg) state.sheetLog = 'Sheet error: Sheet ID ar Apps Script URL duitai lagbe';
        else {
          try {
            const res = await postSheet(cfg, []);
            state.sheetLog = res.ok ? `Connected! Sheet: "${res.sheet}"` : `Sheet error: ${res.error}`;
          } catch (e) {
            state.sheetLog = `Sheet error: ${e.message}`;
          }
        }
        await save();
        reply({ ok: true });
        break;
      }

      case 'syncSheet': {
        // Sheet skips rows it already has, so re-sending everything is safe.
        state.sheetPending = [];
        state.sheetLog = `${state.results.length} ta result Sheet e pathano hocche...`;
        await save();
        await queueForSheet(state.results, true);
        reply({ ok: true });
        break;
      }

      case 'done': {
        flushSheet();
        if (state.status === 'running') {
          await jitterDelay();
          await nextQuery();
        }
        reply({ ok: true });
        break;
      }
    }
  })();
  return true; // async reply
});

function jitterDelay() {
  return new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
}
