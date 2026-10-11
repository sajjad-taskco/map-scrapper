// Google Apps Script web app: receives rows from the Map Scrapper extension
// and appends them to the Google Sheet whose ID the extension sends.
//
// Setup: see README.md ("Google Sheet e save").

// Change this to any random text and put the same value in the extension popup.
const SECRET = 'change-me-to-something-random';

const COLUMNS = ['query', 'name', 'category', 'rating', 'reviews', 'address', 'phone', 'website', 'emails', 'plus_code', 'latitude', 'longitude', 'cid', 'sponsored', 'url'];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json({ ok: false, error: 'Secret mile nai' });

    const ss = SpreadsheetApp.openById(body.sheetId);
    let sheet = null;
    if (body.gid !== undefined && body.gid !== '') {
      sheet = ss.getSheets().find((s) => String(s.getSheetId()) === String(body.gid));
    }
    sheet = sheet || ss.getSheets()[0];

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(COLUMNS);
        sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }

      // Follow whatever column order the sheet's header row already has.
      const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      const keyOf = (r) => String(r.cid || r.url || '');

      // Skip places already in the sheet (matched by cid, else url).
      const existing = new Set();
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const cidCol = header.indexOf('cid');
        const urlCol = header.indexOf('url');
        const values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
        for (const row of values) {
          const k = (cidCol >= 0 && row[cidCol]) || (urlCol >= 0 && row[urlCol]);
          if (k) existing.add(String(k));
        }
      }

      const rows = [];
      for (const r of body.rows || []) {
        const k = keyOf(r);
        if (k && existing.has(k)) continue;
        existing.add(k);
        rows.push(header.map((col) => (r[col] === undefined || r[col] === null ? '' : String(r[col]))));
      }

      if (rows.length) {
        const range = sheet.getRange(lastRow + 1, 1, rows.length, header.length);
        range.setNumberFormat('@'); // keep phone numbers like +880... as text
        range.setValues(rows);
      }
      return json({ ok: true, added: rows.length, skipped: (body.rows || []).length - rows.length, sheet: sheet.getName() });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Opening the URL in a browser sends a GET; just confirm the deploy works.
function doGet() {
  return json({ ok: true, message: 'Map Scrapper Apps Script cholche. Ei URL ta extension e boshao.' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
