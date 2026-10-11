// Runs inside google.com/maps. Scrolls the results list and extracts each place.

let stopped = false;
let running = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => sleep(min + Math.random() * (max - min));
const text = (el) => (el ? el.textContent.trim() : '');

async function waitFor(fn, timeout = 10000, interval = 250) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (stopped) return null;
    const v = fn();
    if (v) return v;
    await sleep(interval);
  }
  return null;
}

function parseNumber(s) {
  if (!s) return '';
  const m = s.replace(/[,\s]/g, '').match(/\d+(\.\d+)?/);
  return m ? m[0] : '';
}

// Lat/lng and CID live inside the place URL: ...!1s0xabc:0xdef...!3d23.7!4d90.4...
function parseUrl(href) {
  const out = { latitude: '', longitude: '', cid: '' };
  const ll = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (ll) {
    out.latitude = ll[1];
    out.longitude = ll[2];
  }
  const id = href.match(/!1s0x[0-9a-f]+:(0x[0-9a-f]+)/i);
  if (id) {
    try {
      out.cid = BigInt(id[1]).toString();
    } catch (_) {}
  }
  return out;
}

// Quick data straight from the result card (no click needed).
function parseCard(link) {
  const card = link.closest('.Nv2PK') || link.parentElement;
  const href = link.href;
  const data = {
    name: link.getAttribute('aria-label') || '',
    category: '',
    rating: text(card.querySelector('.MW4etd')),
    reviews: parseNumber(text(card.querySelector('.UY7F9'))) || parseNumber(((card.querySelector('span[role="img"][aria-label*="review" i]') || {}).ariaLabel || '').split(/stars?/i)[1]),
    address: '',
    phone: '',
    website: '',
    emails: '',
    plus_code: '',
    sponsored: /Sponsored/i.test(card.innerText) ? 'yes' : '',
    ...parseUrl(href),
    url: href.split('?')[0],
  };

  // Card info line looks like "Restaurant · $$ · 12 Road Name"
  const lines = card.innerText.split('\n').map((l) => l.trim()).filter(Boolean);
  const info = lines.find((l) => l.includes('·') && !/^\d/.test(l));
  if (info) {
    const parts = info.split('·').map((p) => p.trim()).filter(Boolean);
    data.category = parts[0] || '';
    const addr = parts.slice(1).filter((p) => !/^[$€£₹৳]+$/.test(p) && !/^\d+–\d+/.test(p));
    data.address = addr[addr.length - 1] || '';
  }
  const phone = lines.find((l) => /^\+?[\d\s()-]{7,}$/.test(l.split('·').pop().trim()));
  if (phone) data.phone = phone.split('·').pop().trim();

  return data;
}

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// The detail pane for a clicked card: its h1 matches the card name, or the URL
// already points at this place (names can differ slightly, e.g. extra Bangla name).
function findDetailPane(name, placeKey, prevName) {
  const n = norm(name);
  const prev = norm(prevName);
  const urlMatches = placeKey && location.href.includes(placeKey);
  for (const h of document.querySelectorAll('h1.DUwDvf')) {
    const t = norm(h.textContent);
    if (!t) continue;
    if (t === n || t.startsWith(n) || n.startsWith(t) || (urlMatches && t !== prev)) {
      return h.closest('div[role="main"]') || document;
    }
  }
  return null;
}

// Full data from the place detail panel (after clicking the card).
function parseDetail(pane) {
  const root = pane || document;
  const d = {};
  const name = text(root.querySelector('h1.DUwDvf') || root.querySelector('h1'));
  if (name) d.name = name;
  const cat = text(root.querySelector('button.DkEaL'));
  if (cat) d.category = cat;

  const addr = root.querySelector('button[data-item-id="address"]');
  if (addr) d.address = text(addr.querySelector('.Io6YTe')) || (addr.getAttribute('aria-label') || '').replace(/^Address:\s*/i, '');

  const phone = root.querySelector('button[data-item-id^="phone:tel:"]');
  if (phone) d.phone = text(phone.querySelector('.Io6YTe')) || phone.dataset.itemId.replace('phone:tel:', '');

  const web = root.querySelector('a[data-item-id="authority"]');
  if (web) d.website = web.href;

  const plus = root.querySelector('button[data-item-id="oloc"]');
  if (plus) d.plus_code = text(plus.querySelector('.Io6YTe'));

  const ratingBox = root.querySelector('div.F7nice');
  if (ratingBox) {
    const r = text(ratingBox.querySelector('span[aria-hidden="true"]'));
    if (r) d.rating = r;
  }
  // Review count: an element labelled like "1,252 reviews".
  const rv = [...root.querySelectorAll('[aria-label]')].find((e) => /^[\d,.]+\s+reviews?$/i.test(e.getAttribute('aria-label').trim()));
  if (rv) d.reviews = parseNumber(rv.getAttribute('aria-label'));
  return d;
}

function reachedEnd(feed) {
  return !!feed.querySelector('span.HlvSq') || /reached the end of the list/i.test(feed.innerText.slice(-500));
}

async function scrape(opts) {
  const { detailed = true, query = '', skipSeen = true } = opts;
  stopped = false;
  running = true;
  let count = 0;

  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

  // Places scraped in earlier runs: skipped without clicking.
  const { seen: history = {} } = skipSeen ? await chrome.storage.local.get('seen') : {};

  const feed = await waitFor(() => document.querySelector('div[role="feed"]'), 15000);

  // Search matched exactly one place: Maps opens its detail page directly.
  if (!feed) {
    const pane = await waitFor(() => document.querySelector('h1.DUwDvf') && document.querySelector('div[role="main"]'), 5000);
    const url = location.href.split('?')[0];
    if (pane && !stopped && history[parseUrl(location.href).cid || url]) {
      send({ type: 'skip' });
    } else if (pane && !stopped) {
      const item = { name: '', category: '', rating: '', reviews: '', address: '', phone: '', website: '', emails: '', plus_code: '', sponsored: '', ...parseUrl(location.href), url, ...parseDetail(pane) };
      await send({ type: 'item', item: { query, ...item } });
      count = 1;
    }
    running = false;
    send({ type: 'done', count, reason: pane ? 'single' : 'no-results' });
    return;
  }

  const seen = new Set();
  let idleRounds = 0;
  let prevName = '';

  // No limit: keeps going until Maps shows the end of the list or nothing new loads.
  while (!stopped) {
    const links = [...feed.querySelectorAll('a.hfpxzc')];
    let gotNew = false;

    for (const link of links) {
      if (stopped) break;
      const key = link.href.split('?')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      gotNew = true;
      if (history[parseUrl(link.href).cid || key]) {
        send({ type: 'skip' });
        continue;
      }

      let item = parseCard(link);
      if (detailed) {
        link.scrollIntoView({ block: 'center' });
        link.click();
        const placeKey = (link.href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) || [])[1];
        const pane = await waitFor(() => findDetailPane(item.name, placeKey, prevName), 12000);
        if (pane) {
          // Wait for the info rows (address/phone/website) to render.
          await waitFor(() => pane.querySelector('[data-item-id="address"], [data-item-id^="phone:tel:"], [data-item-id="authority"]'), 4000);
          await sleep(700);
          item = { ...item, ...parseDetail(pane) };
          prevName = item.name;
        } else {
          console.warn('[Map Scrapper] detail pane not found:', item.name);
        }
        await jitter(300, 800);
      }
      count++;
      await send({ type: 'item', item: { query, ...item } });
    }

    if (stopped) break;
    if (reachedEnd(feed)) break;

    feed.scrollTop = feed.scrollHeight;
    await jitter(1500, 2500);

    idleRounds = gotNew ? 0 : idleRounds + 1;
    if (idleRounds >= 5) break; // nothing new loads anymore
  }

  running = false;
  send({ type: 'done', count, reason: stopped ? 'stopped' : 'finished' });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'start') {
    if (!running) scrape(msg.opts || {});
    reply({ ok: true });
  } else if (msg.type === 'stop') {
    stopped = true;
    reply({ ok: true });
  } else if (msg.type === 'ping') {
    reply({ ok: true, running });
  }
});

// Tell the background we are loaded; it replies if a queued search is waiting for this tab.
chrome.runtime.sendMessage({ type: 'ready' }).then((resp) => {
  if (resp && resp.start) scrape(resp.opts);
}).catch(() => {});
