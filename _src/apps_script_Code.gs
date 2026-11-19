/**
 * SB COFFEE RUN — 커피팟 주문·정산용 Google Apps Script
 *   앱 주소: https://imsean629.github.io/sangsinbrake-os/coffee/
 *
 * 설치
 *  1. 새 구글 스프레드시트를 만들고 [확장 프로그램 → Apps Script]를 엽니다.
 *  2. 기본 코드를 지우고 이 파일 전체를 붙여넣습니다.
 *  3. 아래 ADMIN_PIN에 관리자 PIN(6자 이상, 숫자·영문)을 넣고 저장합니다.
 *  4. [배포 → 새 배포 → 유형: 웹 앱] / 실행 사용자: 나 / 액세스 권한: 모든 사용자 → 배포
 *  5. 나온 웹 앱 URL(https://script.google.com/macros/s/…/exec)을 알려 주세요.
 *  코드를 고친 뒤에는 [배포 → 배포 관리 → 수정(연필) → 버전: 새 버전]으로 올려야 URL이 유지됩니다.
 *
 * 탭(처음 호출 때 자동 생성)
 *  회원  : 입장 신청·승인. '상태' 칸을 직접 '승인'으로 바꿔도 됩니다(대기/승인/거절/차단/교체됨).
 *  카페  : 카페 이름·최소주문금액. 행을 추가하면 앱에 카페가 생깁니다.
 *  메뉴  : 카페별 기본 메뉴·가격. 여기서 고치면 앱에 바로 반영됩니다.
 *  팟    : 열린 커피팟(주인·마감·상태·골든벨)
 *  주문  : 팟별 주문(한 사람이 한 팟에 한 줄, 다시 담으면 덮어쓰기)
 *
 * 개인정보: PORTAL ID·이름만 받습니다. PORTAL ID와 기기 키는 앱으로 내보내지 않습니다(주문서·정산·랭킹엔 이름만).
 * 기기 키는 해시(SHA-256)로만 저장합니다. 송금은 토스 아이디·카카오페이 송금 링크만(계좌번호 저장 안 함).
 */
const SHEET_ID = '';            // 시트 ID(주소의 /d/ 와 /edit 사이). 시트에서 바로 연 스크립트면 비워 둬도 됨
const ADMIN_PIN = '';           // ← 관리자 PIN을 넣으세요 (6자 이상). 비어 있으면 관리자 화면이 잠깁니다.
const TZ = 'Asia/Seoul';

const T = {
  members: { name: '회원', cols: ['신청시각', 'PORTAL ID', '이름', '상태', '키해시', '토스ID', '카카오페이링크', '처리시각'] },
  cafes:   { name: '카페', cols: ['카페', '최소주문', '안내'] },
  menu:    { name: '메뉴', cols: ['카페', '분류', '메뉴', '가격'] },
  pots:    { name: '팟', cols: ['pid', '열린시각', '날짜', '카페', '주인', '주인PORTAL', '마감', '상태', '골든벨', '골든벨PORTAL', '골든벨송금', '한마디', '최소주문', '확정합계'] },
  orders:  { name: '주문', cols: ['oid', 'pid', '날짜', 'PORTAL', '이름', '주문내역', '잔수', '금액', '송금', '입금확인', '시각', 'items'] },
};
const DEFAULT_CAFES = [['더벤티 테크노폴리스점', 9900, '메뉴판에 없는 메뉴는 더벤티 앱에서 테크노폴리스점 가격을 확인해 직접 입력']];
const DEFAULT_MENU = [
  ['더벤티 테크노폴리스점', '인기', '(아이스)아메리카노', 2500],
  ['더벤티 테크노폴리스점', '인기', '(아이스)바닐라딥라떼', 4200],
  ['더벤티 테크노폴리스점', '인기', '복숭아아이스티', 3500],
  ['더벤티 테크노폴리스점', '인기', '아샤츄', 4000],
  ['더벤티 테크노폴리스점', '인기', '디카페인 (아이스)아메리카노', 3500],
];
const OPEN = '모집', LOCKED = '확정', ORDERED = '주문완료', DONE = '정산완료', CANCEL = '취소';

/* ---------- 시트 공통 ---------- */
function book_() {  // 시트 주소 전체를 넣어도 ID만 뽑아 씀
  const id = (String(SHEET_ID).match(/\/d\/([\w-]{20,})/) || [0, String(SHEET_ID).trim()])[1];
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function sheet_(k) {
  const t = T[k], ss = book_();
  let sh = ss.getSheetByName(t.name);
  if (!sh) {
    sh = ss.insertSheet(t.name); sh.appendRow(t.cols); sh.setFrozenRows(1);
    if (k === 'cafes') DEFAULT_CAFES.forEach(r => sh.appendRow(r));
    if (k === 'menu') DEFAULT_MENU.forEach(r => sh.appendRow(r));
  }
  return sh;
}
function txt_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v == null ? '' : v).replace(/^'/, ''); }
function rows_(k) {           // → [{_r: 행번호, 열이름: 값, …}]
  const t = T[k], sh = sheet_(k), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, t.cols.length).getValues().map((v, i) => {
    const o = { _r: i + 2 }; t.cols.forEach((c, j) => o[c] = v[j]); return o;
  });
}
function cell_(v) {           // 시트에 쓸 값: 문자열은 텍스트로 고정(수식·자동 변환 방지)
  if (typeof v === 'number') return isFinite(v) ? v : '';
  if (v instanceof Date) return v;
  const s = String(v == null ? '' : v);
  return s === '' ? '' : "'" + s;
}
function put_(k, o) {         // o._r 있으면 그 행 덮어쓰기, 없으면 추가
  const t = T[k], sh = sheet_(k), row = t.cols.map(c => cell_(o[c]));
  if (o._r) sh.getRange(o._r, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); o._r = sh.getLastRow(); }
  return o;
}
function clean_(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 50);
}
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function now_() { return Date.now(); }
function day_(ms) { return Utilities.formatDate(new Date(ms == null ? now_() : ms), TZ, 'yyyy-MM-dd'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(code, extra) { const o = { ok: false, error: code }; for (const k in (extra || {})) o[k] = extra[k]; return o; }

/* ---------- 진입점 ---------- */
// 오류가 나도 HTML 오류 페이지 대신 JSON으로 돌려줌(앱 화면에 원인이 보이게)
function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (x) { return json_(err_('bad')); }
  try { return json_(handle_(d)); } catch (x) { return json_(err_('server', { msg: String(x && x.message || x) })); }
}
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.q) return json_(handle_(JSON.parse(p.q)));
    return json_(ping_());
  } catch (x) { return json_(err_('server', { msg: String(x && x.message || x) })); }
}
// 웹앱 주소를 브라우저로 열면 연결 상태를 보여 줌
function ping_() {
  const ss = book_();
  if (!ss) return err_('nosheet', { msg: '스크립트가 스프레드시트에 붙어 있지 않아요. 시트의 [확장 프로그램 → Apps Script]에서 만들거나 SHEET_ID를 넣어 주세요.' });
  ['members', 'cafes', 'menu', 'pots', 'orders'].forEach(sheet_);
  return { ok: true, app: 'SB COFFEE RUN', sheet: ss.getName(), adminPin: String(ADMIN_PIN).length >= 6 ? '설정됨' : '없음(6자 이상 필요)' };
}

function handle_(d) {
  if (!book_()) return err_('nosheet');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const a = String(d.a || '');
    if (a === 'join') return join_(d);
    if (a === 'me') return me_(d);
    if (a === 'admin') return admin_(d);
    const m = auth_(d.key);
    if (!m) return err_('auth');
    const f = { state: state_, pay: setPay_, open: open_, order: order_, bell: bell_, close: close_, extend: extend_,
      cancel: cancelPot_, ordered: ordered_, sent: sent_, confirm: confirm_, finish: finish_, report: report_ }[a];
    return f ? f(m, d) : err_('bad');
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 회원 ---------- */
function validKey_(k) { return /^[A-Za-z0-9]{24,64}$/.test(String(k || '')); }
function member_(key) {
  if (!validKey_(key)) return null;
  const h = hash_(key);
  return rows_('members').filter(r => txt_(r['키해시']) === h).pop() || null;
}
function auth_(key) { const m = member_(key); return m && txt_(m['상태']) === '승인' ? m : null; }
function pub_(m) {
  return { status: txt_(m['상태']), name: txt_(m['이름']), toss: txt_(m['토스ID']), kakao: txt_(m['카카오페이링크']) };
}

function join_(d) {
  const portal = clean_(d.portal, 40).replace(/@sangsin\.com$/i, '').slice(0, 30), name = clean_(d.name, 12);
  if (!/^[A-Za-z0-9._@-]{2,30}$/.test(portal) || name.length < 1 || !validKey_(d.key)) return err_('input');
  const old = member_(d.key);
  if (old && ['승인', '차단'].indexOf(txt_(old['상태'])) >= 0) return { ok: true, me: pub_(old) };
  const o = old || {};
  o['신청시각'] = new Date(now_()); o['PORTAL ID'] = portal; o['이름'] = name; o['상태'] = '대기';
  o['키해시'] = hash_(d.key); o['처리시각'] = '';
  if (!old) {  // 같은 PORTAL ID로 승인된 이전 기기가 있으면 송금 수단을 이어받음(승인은 다시 받아야 함)
    const prev = rows_('members').filter(r => txt_(r['PORTAL ID']).toLowerCase() === portal.toLowerCase() && txt_(r['상태']) === '승인').pop();
    if (prev) { o['토스ID'] = txt_(prev['토스ID']); o['카카오페이링크'] = txt_(prev['카카오페이링크']); }
  }
  put_('members', o);
  return { ok: true, me: pub_(o) };
}
function me_(d) {
  const m = member_(d.key);
  return m ? { ok: true, me: pub_(m) } : { ok: true, me: null };
}
function setPay_(m, d) {
  let toss = clean_(d.toss, 60).replace(/^https?:\/\//, '').replace(/^toss\.me\//i, '').replace(/\/.*$/, '');
  const kakao = clean_(d.kakao, 80);
  if (toss && !/^[A-Za-z0-9가-힣_.-]{2,30}$/.test(toss)) return err_('toss');
  if (kakao && !/^https:\/\/qr\.kakaopay\.com\/[A-Za-z0-9]+$/.test(kakao)) return err_('kakao');
  m['토스ID'] = toss; m['카카오페이링크'] = kakao; put_('members', m);
  return { ok: true, me: pub_(m) };
}

/* ---------- 카페·메뉴 ---------- */
function cafes_() {
  return rows_('cafes').filter(r => txt_(r['카페'])).map(r => ({ name: txt_(r['카페']), min: Number(r['최소주문']) || 0, note: txt_(r['안내']) }));
}
function menu_() {
  return rows_('menu').filter(r => txt_(r['메뉴']) && Number(r['가격']) > 0)
    .map(r => ({ cafe: txt_(r['카페']), cat: txt_(r['분류']) || '메뉴', name: txt_(r['메뉴']), price: Number(r['가격']) }));
}

/* ---------- 팟 ---------- */
function pot_(pid) { return rows_('pots').filter(r => txt_(r['pid']) === String(pid)).pop() || null; }
function potOrders_(pid) { return rows_('orders').filter(r => txt_(r['pid']) === String(pid)); }
function isOwner_(m, p) { return txt_(p['주인PORTAL']).toLowerCase() === txt_(m['PORTAL ID']).toLowerCase(); }
function same_(m, portal) { return txt_(portal).toLowerCase() === txt_(m['PORTAL ID']).toLowerCase(); }
function total_(os) { return os.reduce((s, o) => s + (Number(o['금액']) || 0), 0); }
function oidShort_(o) { return hash_(txt_(o['oid'])).slice(0, 10); }

// 누가 얼마를 보내야 하는지: 골든벨이 없으면 각자 자기 금액, 있으면 울린 사람이 전액(주인이 울렸으면 아무도 안 보냄)
function owe_(p, os, portal) {
  const bell = txt_(p['골든벨PORTAL']), owner = txt_(p['주인PORTAL']).toLowerCase(), me = String(portal).toLowerCase();
  if (me === owner) return 0;
  if (bell) return bell.toLowerCase() === me ? total_(os) : 0;
  const o = os.filter(x => txt_(x['PORTAL']).toLowerCase() === me).pop();
  return o ? Number(o['금액']) || 0 : 0;
}

function view_(m, p, pays) {
  const os = potOrders_(p['pid']), owner = isOwner_(m, p), bell = txt_(p['골든벨PORTAL']);
  const st = txt_(p['상태']), dl = Number(p['마감']) || 0;
  const mine = os.filter(o => same_(m, o['PORTAL'])).pop();
  const payer = pays[txt_(p['주인PORTAL']).toLowerCase()] || {};
  const v = {
    pid: txt_(p['pid']), cafe: txt_(p['카페']), owner: txt_(p['주인']), isOwner: owner, day: txt_(p['날짜']),
    deadline: dl, status: st, expired: st === OPEN && now_() >= dl, memo: txt_(p['한마디']), min: Number(p['최소주문']) || 0,
    bell: txt_(p['골든벨']), bellMine: !!bell && same_(m, bell), total: total_(os), cups: os.reduce((s, o) => s + (Number(o['잔수']) || 0), 0),
    orders: os.map(o => ({
      id: oidShort_(o), name: txt_(o['이름']), items: parseItems_(o['items']), amount: Number(o['금액']) || 0,
      mine: same_(m, o['PORTAL']), sent: txt_(o['송금']) === 'Y', ok: txt_(o['입금확인']) === 'Y',
      owe: owe_(p, os, txt_(o['PORTAL'])),
    })),
    myItems: mine ? parseItems_(mine['items']) : [],
    owe: owe_(p, os, txt_(m['PORTAL ID'])),
    pay: { toss: payer.toss || '', kakao: payer.kakao || '' },
  };
  if (bell && !same_({ 'PORTAL ID': txt_(p['주인PORTAL']) }, bell)) {
    v.bellPay = { name: txt_(p['골든벨']), sent: txt_(p['골든벨송금']) === 'Y', ok: txt_(p['골든벨송금']) === 'OK', amount: v.total };
  }
  if (bell && v.bellMine && !owner) v.mySent = v.bellPay.sent || v.bellPay.ok;
  else v.mySent = mine ? txt_(mine['송금']) === 'Y' || txt_(mine['입금확인']) === 'Y' : false;
  return v;
}
function parseItems_(s) { try { const a = JSON.parse(txt_(s)); return Array.isArray(a) ? a : []; } catch (x) { return []; } }

function state_(m) {
  const today = day_(), pays = {};
  rows_('members').forEach(r => { if (txt_(r['상태']) === '승인') pays[txt_(r['PORTAL ID']).toLowerCase()] = { toss: txt_(r['토스ID']), kakao: txt_(r['카카오페이링크']) }; });
  const myPids = {};
  rows_('orders').forEach(o => { if (same_(m, o['PORTAL'])) myPids[txt_(o['pid'])] = 1; });
  const pots = rows_('pots').filter(p => {
    const st = txt_(p['상태']);
    if (st === CANCEL) return false;
    if (txt_(p['날짜']) === today) return true;
    // 지난 날짜라도 정산이 안 끝났고 내가 관련된 팟은 계속 보여 줌
    return st !== DONE && (myPids[txt_(p['pid'])] || isOwner_(m, p) || same_(m, p['골든벨PORTAL']));
  }).map(p => view_(m, p, pays));
  pots.sort((a, b) => (a.status === OPEN ? 0 : 1) - (b.status === OPEN ? 0 : 1) || b.deadline - a.deadline);
  return { ok: true, now: now_(), today: today, me: pub_(m), cafes: cafes_(), menu: menu_(), pots: pots };
}

function open_(m, d) {
  if (!txt_(m['토스ID']) && !txt_(m['카카오페이링크'])) return err_('nopay');
  const cafe = cafes_().filter(c => c.name === String(d.cafe)).pop();
  if (!cafe) return err_('cafe');
  const mins = Math.round(Number(d.mins));
  if (!(mins >= 5 && mins <= 180)) return err_('mins');
  const mineOpen = rows_('pots').filter(p => txt_(p['상태']) === OPEN && isOwner_(m, p) && txt_(p['날짜']) === day_());
  if (mineOpen.length) return err_('already');
  const t = now_(), pid = day_(t).replace(/-/g, '') + '-' + hash_(m['PORTAL ID'] + t + Math.random()).slice(0, 6);
  put_('pots', {
    pid: pid, '열린시각': new Date(t), '날짜': day_(t), '카페': cafe.name, '주인': txt_(m['이름']), '주인PORTAL': txt_(m['PORTAL ID']),
    '마감': t + mins * 60000, '상태': OPEN, '골든벨': '', '골든벨PORTAL': '', '골든벨송금': '', '한마디': clean_(d.memo, 40),
    '최소주문': cafe.min, '확정합계': '',
  });
  return Object.assign(state_(m), { pid: pid });
}

function order_(m, d) {
  const p = pot_(d.pid);
  if (!p || txt_(p['상태']) !== OPEN) return err_('closed');
  if (now_() >= Number(p['마감'])) return err_('late');
  const menu = menu_().filter(x => x.cafe === txt_(p['카페']));
  const raw = Array.isArray(d.items) ? d.items.slice(0, 10) : [];
  const items = [];
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i] || {}, q = Math.round(Number(it.q)), opt = clean_(it.o, 30);
    if (!(q >= 1 && q <= 10)) return err_('qty');
    if (it.c) {
      const n = clean_(it.n, 30), pr = Math.round(Number(it.p));
      if (!n || !(pr >= 100 && pr <= 50000)) return err_('custom');
      items.push({ n: n, p: pr, q: q, o: opt, c: 1 });
    } else {
      const mm = menu.filter(x => x.name === String(it.n)).pop();
      if (!mm) return err_('menu');
      items.push({ n: mm.name, p: mm.price, q: q, o: opt });
    }
  }
  const oid = txt_(p['pid']) + '_' + txt_(m['PORTAL ID']).toLowerCase();
  const old = rows_('orders').filter(o => txt_(o['oid']) === oid).pop();
  if (!items.length) {                 // 빈 주문 = 취소
    if (old) sheet_('orders').deleteRow(old._r);
    return state_(m);
  }
  const amount = items.reduce((s, x) => s + x.p * x.q, 0);
  const o = old || {};
  Object.assign(o, {
    oid: oid, pid: txt_(p['pid']), '날짜': txt_(p['날짜']), PORTAL: txt_(m['PORTAL ID']), '이름': txt_(m['이름']),
    '주문내역': items.map(x => (x.c ? '[직접] ' : '') + x.n + (x.o ? '(' + x.o + ')' : '') + ' ×' + x.q).join(' / '),
    '잔수': items.reduce((s, x) => s + x.q, 0), '금액': amount, '송금': '', '입금확인': '', '시각': new Date(now_()), items: JSON.stringify(items),
  });
  put_('orders', o);
  return state_(m);
}

function bell_(m, d) {
  const p = pot_(d.pid);
  if (!p || txt_(p['상태']) !== OPEN) return err_('closed');
  const cur = txt_(p['골든벨PORTAL']);
  if (d.on) {
    if (cur && !same_(m, cur)) return err_('taken', { by: txt_(p['골든벨']) });
    p['골든벨'] = txt_(m['이름']); p['골든벨PORTAL'] = txt_(m['PORTAL ID']);
  } else {
    if (!cur || !same_(m, cur)) return err_('notmine');
    p['골든벨'] = ''; p['골든벨PORTAL'] = '';
  }
  p['골든벨송금'] = '';
  put_('pots', p);
  return state_(m);
}

function ownPot_(m, d, st) {
  const p = pot_(d.pid);
  if (!p) return [null, err_('nopot')];
  if (!isOwner_(m, p)) return [null, err_('owner')];
  if (st && st.indexOf(txt_(p['상태'])) < 0) return [null, err_('status')];
  return [p, null];
}
function close_(m, d) {
  const [p, e] = ownPot_(m, d, [OPEN]); if (e) return e;
  const os = potOrders_(p['pid']), tot = total_(os), min = Number(p['최소주문']) || 0;
  if (!os.length) return err_('empty');
  if (tot < min) return err_('min', { short: min - tot, total: tot, min: min });
  p['상태'] = LOCKED; p['확정합계'] = tot; put_('pots', p);
  return state_(m);
}
function extend_(m, d) {
  const [p, e] = ownPot_(m, d, [OPEN]); if (e) return e;
  const mins = Math.round(Number(d.mins));
  if (!(mins >= 5 && mins <= 60)) return err_('mins');
  p['마감'] = Math.max(now_(), Number(p['마감']) || 0) + mins * 60000; put_('pots', p);
  return state_(m);
}
function cancelPot_(m, d) {
  const [p, e] = ownPot_(m, d, [OPEN, LOCKED]); if (e) return e;
  p['상태'] = CANCEL; put_('pots', p);
  return state_(m);
}
function ordered_(m, d) {
  const [p, e] = ownPot_(m, d, [LOCKED]); if (e) return e;
  p['상태'] = ORDERED; put_('pots', p);
  autoDone_(p);
  return state_(m);
}
// 참여자: "보냈어요" (골든벨을 울린 사람이 주인이 아니면 그 사람이 전액 송금)
function sent_(m, d) {
  const p = pot_(d.pid);
  if (!p || [LOCKED, ORDERED].indexOf(txt_(p['상태'])) < 0) return err_('status');
  const bell = txt_(p['골든벨PORTAL']);
  if (bell) {
    if (!same_(m, bell) || isOwner_(m, p)) return err_('noowe');
    if (txt_(p['골든벨송금']) !== 'OK') p['골든벨송금'] = d.on === false ? '' : 'Y';
    put_('pots', p);
  } else {
    const o = potOrders_(p['pid']).filter(x => same_(m, x['PORTAL'])).pop();
    if (!o || isOwner_(m, p)) return err_('noowe');
    o['송금'] = d.on === false ? '' : 'Y'; put_('orders', o);
  }
  return state_(m);
}
// 주인: 입금 확인 체크 (id = 주문 id, 'bell' = 골든벨 송금)
function confirm_(m, d) {
  const [p, e] = ownPot_(m, d, [LOCKED, ORDERED]); if (e) return e;
  if (d.id === 'bell') {
    if (!txt_(p['골든벨PORTAL'])) return err_('nobell');
    p['골든벨송금'] = d.on === false ? '' : 'OK'; put_('pots', p);
  } else {
    const o = potOrders_(p['pid']).filter(x => oidShort_(x) === String(d.id)).pop();
    if (!o) return err_('noorder');
    o['입금확인'] = d.on === false ? '' : 'Y'; put_('orders', o);
  }
  if (txt_(p['상태']) === ORDERED) autoDone_(p);
  return state_(m);
}
function finish_(m, d) {
  const [p, e] = ownPot_(m, d, [ORDERED]); if (e) return e;
  p['상태'] = DONE; put_('pots', p);
  return state_(m);
}
function autoDone_(p) {   // 받을 돈이 모두 확인되면 자동으로 정산완료
  const os = potOrders_(p['pid']), owner = txt_(p['주인PORTAL']).toLowerCase(), bell = txt_(p['골든벨PORTAL']);
  let done;
  if (bell) done = bell.toLowerCase() === owner || txt_(p['골든벨송금']) === 'OK';
  else done = os.every(o => txt_(o['PORTAL']).toLowerCase() === owner || txt_(o['입금확인']) === 'Y');
  if (done) { p['상태'] = DONE; put_('pots', p); }
}

/* ---------- 리포트·명예의 전당 (이번 달, 주문완료·정산완료 팟만) ---------- */
function report_(m) {
  const month = day_().slice(0, 7), me = txt_(m['PORTAL ID']).toLowerCase();
  const pots = {}; rows_('pots').forEach(p => {
    const st = txt_(p['상태']);
    if ((st === ORDERED || st === DONE) && txt_(p['날짜']).slice(0, 7) === month) pots[txt_(p['pid'])] = p;
  });
  const fav = {}, hall = {};
  let cups = 0, spent = 0, ice = 0, got = 0, rang = 0, rangCups = 0, potsJoined = 0;
  const potCups = {};
  rows_('orders').forEach(o => {
    const p = pots[txt_(o['pid'])]; if (!p) return;
    const n = Number(o['잔수']) || 0; potCups[txt_(o['pid'])] = (potCups[txt_(o['pid'])] || 0) + n;
    if (txt_(o['PORTAL']).toLowerCase() !== me) return;
    potsJoined++; cups += n;
    const bell = txt_(p['골든벨PORTAL']).toLowerCase();
    if (bell && bell !== me) got++; else if (!bell) spent += Number(o['금액']) || 0;
    parseItems_(o['items']).forEach(it => {
      fav[it.n] = (fav[it.n] || 0) + it.q;
      if (/아이스|ice/i.test(it.n + ' ' + (it.o || ''))) ice += it.q;
    });
  });
  Object.keys(pots).forEach(pid => {
    const p = pots[pid], b = txt_(p['골든벨PORTAL']).toLowerCase(); if (!b) return;
    const h = hall[b] || (hall[b] = { name: txt_(p['골든벨']), times: 0, cups: 0, amount: 0 });
    h.name = txt_(p['골든벨']); h.times++; h.cups += potCups[pid] || 0; h.amount += Number(p['확정합계']) || 0;
    if (b === me) { rang++; rangCups += potCups[pid] || 0; spent += Number(p['확정합계']) || 0; }
  });
  const favName = Object.keys(fav).sort((a, b) => fav[b] - fav[a])[0] || '';
  const ranking = Object.keys(hall).map(k => hall[k]).sort((a, b) => b.times - a.times || b.cups - a.cups).slice(0, 20)
    .map(h => ({ name: h.name, times: h.times, cups: h.cups }));
  return { ok: true, month: month, me: { cups: cups, spent: spent, fav: favName, favCount: fav[favName] || 0,
    icePct: cups ? Math.round(ice * 100 / cups) : 0, got: got, rang: rang, rangCups: rangCups, pots: potsJoined }, hall: ranking };
}

/* ---------- 관리자 ---------- */
function admin_(d) {
  const c = CacheService.getScriptCache(), fails = Number(c.get('pinfail') || 0);
  if (fails >= 10) return err_('locked');
  if (!ADMIN_PIN || String(ADMIN_PIN).length < 6) return err_('nopin');
  if (String(d.pin || '') !== String(ADMIN_PIN)) { c.put('pinfail', String(fails + 1), 600); return err_('pin'); }
  const op = String(d.op || 'list'), rs = rows_('members');
  if (op !== 'list') {
    const r = rs.filter(x => x._r === Number(d.row)).pop();
    if (!r) return err_('row');
    const to = { approve: '승인', reject: '거절', block: '차단' }[op];
    if (!to) return err_('bad');
    if (to === '승인') rs.forEach(x => {   // 같은 PORTAL ID의 이전 기기는 교체
      if (x._r !== r._r && txt_(x['PORTAL ID']).toLowerCase() === txt_(r['PORTAL ID']).toLowerCase() && txt_(x['상태']) === '승인') {
        x['상태'] = '교체됨'; x['처리시각'] = new Date(now_()); put_('members', x);
      }
    });
    r['상태'] = to; r['처리시각'] = new Date(now_()); put_('members', r);
  }
  const all = rows_('members'), approved = {};
  all.forEach(x => { if (txt_(x['상태']) === '승인') approved[txt_(x['PORTAL ID']).toLowerCase()] = txt_(x['이름']); });
  return { ok: true, members: all.filter(x => txt_(x['상태']) !== '교체됨').map(x => ({
    row: x._r, portal: txt_(x['PORTAL ID']), name: txt_(x['이름']), status: txt_(x['상태']),
    at: x['신청시각'] instanceof Date ? Utilities.formatDate(x['신청시각'], TZ, 'MM-dd HH:mm') : '',
    dup: txt_(x['상태']) === '대기' && approved[txt_(x['PORTAL ID']).toLowerCase()] ? approved[txt_(x['PORTAL ID']).toLowerCase()] : '',
  })).reverse() };
}
