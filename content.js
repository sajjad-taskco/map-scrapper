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
    reviews: parseNumber(text(card.querySelector('.UY7F9'))),
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

function findDetailPane(name) {
  const panes = [...document.querySelectorAll('div[role="main"]')];
  return panes.find((p) => p.getAttribute('aria-label') === name && p.querySelector('h1'));
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
    const rv = ratingBox.querySelector('span[aria-label*="review" i]');
    if (rv) d.reviews = parseNumber(rv.getAttribute('aria-label'));
  }
  return d;
}

function reachedEnd(feed) {
  return !!feed.querySelector('span.HlvSq') || /reached the end of the list/i.test(feed.innerText.slice(-500));
}

async function scrape(opts) {
  const { max = 100, detailed = true, query = '' } = opts;
  stopped = false;
  running = true;
  let count = 0;

  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

  const feed = await waitFor(() => document.querySelector('div[role="feed"]'), 15000);

  // Search matched exactly one place: Maps opens its detail page directly.
  if (!feed) {
    const pane = await waitFor(() => document.querySelector('h1.DUwDvf') && document.querySelector('div[role="main"]'), 5000);
    if (pane && !stopped) {
      const item = { name: '', category: '', rating: '', reviews: '', address: '', phone: '', website: '', emails: '', plus_code: '', sponsored: '', ...parseUrl(location.href), url: location.href.split('?')[0], ...parseDetail(pane) };
      await send({ type: 'item', item: { query, ...item } });
      count = 1;
    }
    running = false;
    send({ type: 'done', count, reason: pane ? 'single' : 'no-results' });
    return;
  }

  const seen = new Set();
  let idleRounds = 0;

  while (!stopped && count < max) {
    const links = [...feed.querySelectorAll('a.hfpxzc')];
    let gotNew = false;

    for (const link of links) {
      if (stopped || count >= max) break;
      const key = link.href.split('?')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      gotNew = true;

      let item = parseCard(link);
      if (detailed) {
        link.scrollIntoView({ block: 'center' });
        link.click();
        const pane = await waitFor(() => findDetailPane(item.name), 8000);
        if (pane) {
          await sleep(400); // let buttons (phone/website) render
          item = { ...item, ...parseDetail(pane) };
        }
        await jitter(300, 800);
      }
      count++;
      await send({ type: 'item', item: { query, ...item } });
    }

    if (stopped || count >= max) break;
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
