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

      // Places already in the sheet (matched by cid, else url) are updated in place.
      const rowOf = new Map(); // key -> sheet row number
      const lastRow = sheet.getLastRow();
      const cidCol = header.indexOf('cid');
      const urlCol = header.indexOf('url');
      let existingValues = [];
      if (lastRow > 1) {
        existingValues = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
        existingValues.forEach((row, i) => {
          const k = (cidCol >= 0 && row[cidCol]) || (urlCol >= 0 && row[urlCol]);
          if (k) rowOf.set(String(k), i + 2);
        });
      }

      const toCell = (v) => (v === undefined || v === null ? '' : String(v));
      const newRows = [];
      let updated = 0;
      for (const r of body.rows || []) {
        const k = keyOf(r);
        const at = k ? rowOf.get(k) : undefined;
        if (at === -1) continue; // same place twice in this batch
        if (at) {
          // Only overwrite cells where the new data has a value.
          const old = existingValues[at - 2];
          const merged = header.map((col, i) => (toCell(r[col]) !== '' ? toCell(r[col]) : old[i]));
          if (merged.some((v, i) => String(v) !== String(old[i]))) {
            const range = sheet.getRange(at, 1, 1, header.length);
            range.setNumberFormat('@');
            range.setValues([merged]);
            existingValues[at - 2] = merged;
            updated++;
          }
          continue;
        }
        if (k) rowOf.set(k, -1); // duplicate inside this batch
        newRows.push(header.map((col) => toCell(r[col])));
      }

      if (newRows.length) {
        const range = sheet.getRange(lastRow + 1, 1, newRows.length, header.length);
        range.setNumberFormat('@'); // keep phone numbers like 01708... as text
        range.setValues(newRows);
      }
      return json({ ok: true, added: newRows.length, updated, sheet: sheet.getName() });
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
