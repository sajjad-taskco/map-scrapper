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
};

let state = null;

// Clicking the toolbar icon opens the side panel (stays open until closed with ✕).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

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
        reply({ ok: true });
        break;
      }

      case 'clear': {
        state.results = [];
        state.log = '';
        await save();
        reply({ ok: true });
        break;
      }

      case 'item': {
        const key = msg.item.cid || msg.item.url;
        let item = state.results.find((r) => (r.cid || r.url) === key);
        if (item) {
          // Seen before: fill in anything new (e.g. phone found on a re-scrape).
          for (const [k, v] of Object.entries(msg.item)) if (v) item[k] = v;
        } else {
          item = msg.item;
          state.results.push(item);
        }
        state.log = `${state.current || 'Scraping'} — ${state.results.length} ta result`;
        await save();
        if (state.opts.emails && item.website && !item.emails) {
          findEmails(item.website).then(async (emails) => {
            if (emails) {
              item.emails = emails;
              await save();
            }
          });
        }
        reply({ ok: true });
        break;
      }

      case 'done': {
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
