// 가짜 Sheets 환경 + apps_script_Code.gs 로드 (run.js, server.js 공용)
const fs = require('fs'), crypto = require('crypto'), path = require('path');
// 실제 시트처럼: "'" 접두는 텍스트, 숫자 문자열은 숫자, yyyy-mm-dd는 날짜로 자동 변환
function conv(v) { if (typeof v !== 'string') return v; if (v.startsWith("'")) return v.slice(1);
  if (/^\d+$/.test(v)) return Number(v); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00+09:00'); return v; }
function Sheet(name) { this.name = name; this.d = []; }
Sheet.prototype = {
  appendRow(r) { this.d.push(r.map(conv)); }, setFrozenRows() {}, getLastRow() { return this.d.length; },
  deleteRow(r) { this.d.splice(r - 1, 1); },
  getRange(r, c, nr, nc) { const S = this; return {
    getValues() { return S.d.slice(r - 1, r - 1 + nr).map(x => { const y = x.slice(c - 1, c - 1 + nc); while (y.length < nc) y.push(''); return y; }); },
    setValues(v) { v.forEach((row, i) => { S.d[r - 1 + i] = S.d[r - 1 + i] || []; row.forEach((x, j) => S.d[r - 1 + i][c - 1 + j] = conv(x)); }); } }; },
};
const book = { tabs: {}, getSheetByName(n) { return this.tabs[n] || null; }, insertSheet(n) { return this.tabs[n] = new Sheet(n); } };
global.__NOW = Date.parse('2026-11-19T10:00:00+09:00');
const cache = {};
global.SpreadsheetApp = { getActiveSpreadsheet: () => book, openById: () => book };
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
global.CacheService = { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) };
global.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
global.Utilities = {
  DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
  formatDate: (d, tz, f) => { const k = new Date(d.getTime() + 9 * 3600e3).toISOString();
    return f.replace('yyyy', k.slice(0, 4)).replace('MM', k.slice(5, 7)).replace('dd', k.slice(8, 10)).replace('HH', k.slice(11, 13)).replace('mm', k.slice(14, 16)); },
};
let src = fs.readFileSync(path.join(__dirname, '../apps_script_Code.gs'), 'utf8')
  .replace("const ADMIN_PIN = '';", "const ADMIN_PIN = 'test1234';")
  .replace('function now_() { return Date.now(); }', 'function now_() { return global.__NOW; }');
eval(src + ';global.doPost=doPost;global.doGet=doGet;');
module.exports = { book };
