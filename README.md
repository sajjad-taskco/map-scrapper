# Map Scrapper (Chrome Extension)

Google Maps থেকে business-এর তথ্য scrape করে CSV / JSON ফাইলে download করে, অথবা সরাসরি Google Sheet-এ save করে। সম্পূর্ণ free — কোনো API key বা server লাগে না।

## Install করার নিয়ম

1. Chrome-এ `chrome://extensions` খোলো
2. উপরে ডান দিকে **Developer mode** চালু করো
3. **Load unpacked** চাপো → এই folder (`map-scrapper`) select করো
4. Toolbar-এ extension-টা pin করে রাখো

> Code-এ কোনো পরিবর্তন করলে `chrome://extensions`-এ গিয়ে extension-এর **Reload (⟳)** বাটন চাপতে হবে।

## ব্যবহার করার নিয়ম

- Popup-এ search লেখো (প্রতি লাইনে একটা, যেমন `restaurants in Dhanmondi`) → **Start** চাপো
- অথবা নিজে Google Maps-এ search করো, তারপর query box খালি রেখে **Start** চাপো
- শেষ হলে **CSV download** / **JSON download** চাপো

### Option-গুলো

| Option | কী করে |
|---|---|
| Max result / query | প্রতিটা search-এ সর্বোচ্চ কয়টা জায়গা নেবে |
| Detail | প্রতিটা জায়গায় click করে phone, website, পুরো address, plus code আনে (ধীরে চলে, কিন্তু data সম্পূর্ণ হয়) |
| Email খোঁজো | Business-এর website (homepage, /contact, /about) থেকে email বের করে |

### Scroll করা data কীভাবে save হয়

1. Extension Maps-এর বাম পাশের list-এ এখন যতগুলো জায়গা দেখা যাচ্ছে, সেগুলো একটা একটা করে পড়ে
2. প্রতিটা জায়গা পড়ার সাথে সাথেই save করে — মাঝপথে Stop করলেও যা পাওয়া গেছে তা হারায় না
3. তারপর নিজে নিজে list-টা নিচে scroll করে, নতুন জায়গা load হলে সেগুলো পড়ে (আগে পড়া জায়গা আবার নেয় না)
4. এটা চলতে থাকে যতক্ষণ না:
   - Maps "You've reached the end of the list" দেখায়, অথবা
   - Max result পূর্ণ হয়, অথবা
   - ৫ বার scroll করার পরও নতুন কিছু না আসে

## Google Sheet-এ save করা (একবারই setup করতে হবে)

Extension নিজে থেকে তোমার Google Sheet-এ লিখতে পারে না, তাই একটা ছোট Google Apps Script একবার deploy করতে হবে। Extension data সেই script-এ পাঠাবে, আর script তোমার দেওয়া Sheet-এ row যোগ করবে।

### ধাপ ১ — Apps Script বানাও

1. [script.google.com](https://script.google.com)-এ যাও → **New project** চাপো
2. ওখানে যা code আছে সব মুছে দাও
3. এই project-এর [apps-script/Code.gs](apps-script/Code.gs) ফাইলের পুরো code copy করে paste করো
4. উপরের এই লাইনটা খুঁজে বের করো:
   ```js
   const SECRET = 'change-me-to-something-random';
   ```
   এর মানটা বদলে নিজের একটা গোপন লেখা দাও (যেমন `sajjad-maps-8x7k2q`)। এটা password-এর মতো — মনে রাখো, পরে লাগবে
5. **Save (💾)** চাপো

### ধাপ ২ — Web app হিসেবে deploy করো

1. উপরে ডান দিকে **Deploy → New deployment** চাপো
2. ⚙️ (Select type) থেকে **Web app** বেছে নাও
3. সেটিং দাও:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. **Deploy** চাপো
5. Google account দিয়ে permission চাইবে → **Authorize access** → নিজের account select করো
   - "Google hasn't verified this app" দেখালে → **Advanced** → **Go to ... (unsafe)** → **Allow** (এটা তোমার নিজের script, তাই সমস্যা নেই)
6. শেষে একটা **Web app URL** দেবে (`https://script.google.com/macros/s/.../exec`) → copy করে রাখো

### ধাপ ৩ — Extension-এ বসাও

1. Extension popup খোলো → **Google Sheet e save** অংশটা খোলো
2. ঘরগুলো পূরণ করো:
   - **Sheet ID ba link:** তোমার Google Sheet-এর পুরো link বা শুধু ID
     (যেমন `https://docs.google.com/spreadsheets/d/1mee2Fg6xN24yTYoiojw_I_MebDUhvIkUfnS1tX46FTY/edit?gid=0`)
     — পুরো link দিলে `gid` দেখে ঠিক tab-এ save করবে
   - **Apps Script URL:** ধাপ ২-এর URL
   - **Secret:** ধাপ ১-এ যা দিয়েছিলে
   - ✅ **"Scrape er shathe shathe Sheet e save koro"** টিক দাও
3. **Test** চাপো → **"Connected!"** দেখালে সব ঠিক আছে

### এরপর কী হবে

- Scrape চলার সময় প্রতি ১০টা জায়গা (বা ৪ সেকেন্ড পর পর) Sheet-এ নতুন row যোগ হবে
- Sheet খালি থাকলে প্রথম row-তে header নিজে বসিয়ে দেবে
- Sheet-এ আগে থেকে আছে এমন জায়গা (একই `cid`/`url`) নতুন row হিসেবে যোগ হবে না — বরং আগের row-টা নতুন data (যেমন phone) দিয়ে update হবে
- আগের scrape করা result Sheet-এ পাঠাতে চাইলে **Sob result Sheet e pathao** চাপো

### সমস্যা হলে

| সমস্যা | সমাধান |
|---|---|
| "Secret mile nai" | Code.gs-এর `SECRET` আর popup-এর Secret একই কিনা দেখো |
| "Apps Script theke JSON ashe nai" | Deploy-এর সময় **Who has access: Anyone** দেওয়া হয়েছে কিনা দেখো, URL `/exec` দিয়ে শেষ হয়েছে কিনা দেখো |
| Sheet খুঁজে পায় না | যে Google account দিয়ে script deploy করেছো, সেই account-এর Sheet-এ edit access আছে কিনা দেখো |
| Code.gs বদলেছি কিন্তু কাজ করে না | **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** করতে হবে |

## Data-এর column-গুলো

`query, name, category, rating, reviews, address, phone, website, emails, plus_code, latitude, longitude, cid, sponsored, url`

## জরুরি কথা

- Google Maps-এর HTML class name (`.hfpxzc`, `.DUwDvf` ইত্যাদি) Google মাঝে মাঝে বদলায়। কোনো field খালি আসলে `content.js`-এর selector update করতে হবে।
- Search URL-এ `hl=en` দেওয়া আছে যাতে English label আসে (parsing-এর জন্য দরকার)।
- খুব বেশি বা খুব দ্রুত scrape করলে Google captcha দিতে পারে — delay দেওয়া আছে, তবুও একবারে হাজার হাজার না করাই ভালো।
- Google-এর Terms of Service scraping-এর অনুমতি দেয় না — নিজের দায়িত্বে ব্যবহার করো।
