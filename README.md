# Map Scrapper (Chrome Extension)

Google Maps থেকে business-এর তথ্য scrape করে CSV / JSON ফাইলে download করে। সম্পূর্ণ free — কোনো API key বা server লাগে না।

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
| Detail | প্রতিটা জায়গায় click করে phone, website, পুরো address, plus code আনে (ধীরে চলে, কিন্তু data সম্পূর্ণ হয়) |
| Email খোঁজো | Business-এর website (homepage, /contact, /about) থেকে email বের করে |
| আগেরগুলো skip করো | আগে scrape করা জায়গা (history-তে আছে) আবার নেয় না, click-ও করে না — শুধু নতুনগুলো আসে |
| History Reset | History মুছে দেয়, পরের বার সব জায়গা আবার আসবে। **Clear** শুধু result মোছে, history না |

### Scroll করা data কীভাবে save হয়

1. Extension Maps-এর বাম পাশের list-এ এখন যতগুলো জায়গা দেখা যাচ্ছে, সেগুলো একটা একটা করে পড়ে
2. প্রতিটা জায়গা পড়ার সাথে সাথেই save করে — মাঝপথে Stop করলেও যা পাওয়া গেছে তা হারায় না
3. তারপর নিজে নিজে list-টা নিচে scroll করে, নতুন জায়গা load হলে সেগুলো পড়ে (আগে পড়া জায়গা আবার নেয় না)
4. এটা চলতে থাকে যতক্ষণ না:
   - Maps "You've reached the end of the list" দেখায়, অথবা
   - ৫ বার scroll করার পরও নতুন কিছু না আসে

## Data-এর column-গুলো

`query, name, category, rating, reviews, address, phone, website, emails, plus_code, latitude, longitude, cid, sponsored, url`

## জরুরি কথা

- Google Maps-এর HTML class name (`.hfpxzc`, `.DUwDvf` ইত্যাদি) Google মাঝে মাঝে বদলায়। কোনো field খালি আসলে `content.js`-এর selector update করতে হবে।
- Search URL-এ `hl=en` দেওয়া আছে যাতে English label আসে (parsing-এর জন্য দরকার)।
- খুব বেশি বা খুব দ্রুত scrape করলে Google captcha দিতে পারে — delay দেওয়া আছে, তবুও একবারে হাজার হাজার না করাই ভালো।
- Google-এর Terms of Service scraping-এর অনুমতি দেয় না — নিজের দায়িত্বে ব্যবহার করো।
