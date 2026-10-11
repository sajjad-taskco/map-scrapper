# Map Scrapper (Chrome Extension)

Scrapes business info from Google Maps and downloads it as a CSV / JSON file. Completely free — no API key or server needed.

## Installation

1. Open `chrome://extensions` in Chrome
2. Turn on **Developer mode** in the top right
3. Click **Load unpacked** → select this folder (`map-scrapper`)
4. Pin the extension to the toolbar

> After any code change, go to `chrome://extensions` and click the extension's **Reload (⟳)** button.

## Usage

- Type searches in the panel (one per line, e.g. `restaurants in Dhanmondi`) → click **Start**
- Or search on Google Maps yourself, leave the query box empty and click **Start**
- When it finishes, click **CSV** / **JSON** to download

### Options

| Option | What it does |
|---|---|
| Detail mode | Clicks each place to get phone, website, full address and plus code (slower, but the data is complete) |
| Find emails | Extracts emails from the business website (homepage, /contact, /about) |
| Skip previous | Places already scraped (in history) are not taken or clicked again — only new ones come in |
| History Reset | Clears the history, so all places will be scraped again next time. **Clear** only deletes results, not history |

### How scrolled data is saved

1. The extension reads the places currently visible in the Maps list on the left, one by one
2. Each place is saved as soon as it is read — stopping midway doesn't lose what was already found
3. Then it scrolls the list down by itself and reads newly loaded places (places already read are not taken again)
4. This continues until:
   - Maps shows "You've reached the end of the list", or
   - Nothing new loads after scrolling 5 times

## Data columns

`query, name, category, rating, reviews, address, phone, website, emails, plus_code, latitude, longitude, cid, sponsored, url`

## Important notes

- Google sometimes changes Maps' HTML class names (`.hfpxzc`, `.DUwDvf` etc.). If a field comes back empty, the selectors in `content.js` need updating.
- The search URL includes `hl=en` so labels come in English (needed for parsing).
- Scraping too much or too fast can trigger a Google captcha — delays are built in, but it's still best not to scrape thousands at once.
- Google's Terms of Service do not allow scraping — use at your own risk.
