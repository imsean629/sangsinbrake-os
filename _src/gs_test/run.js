// 가짜 Sheets로 apps_script_Code.gs 검증:  node run.js
const { book } = require('./fake.js');
const T0 = 0;
const call = o => JSON.parse(doPost({ postData: { contents: JSON.stringify(o) } }).getContent());
let ok = true; const chk = (c, m) => { ok = ok && !!c; console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); };
const K = n => ('k' + n).padEnd(32, 'x');
const A = K('sean'), B = K('kim'), C = K('lee'), FAKE = K('fake'), B2 = K('kimnew');

// 1) 입장 신청·승인
chk(call({ a: 'state', key: A }).error === 'auth', '미가입 기기는 막힘');
chk(call({ a: 'join', portal: 'sean01', name: 'Sean', key: A }).me.status === '대기', '입장 신청 → 대기');
chk(call({ a: 'join', portal: 'bad id!', name: 'x', key: B }).error === 'input', 'PORTAL ID 형식 검증');
call({ a: 'join', portal: 'kim01', name: '김상신', key: B });
call({ a: 'join', portal: 'lee01', name: '=이브레이크', key: C });
chk(call({ a: 'state', key: A }).error === 'auth', '승인 전엔 이용 불가');
chk(call({ a: 'admin', pin: 'wrong', op: 'list' }).error === 'pin', '관리자 PIN 오류');
let L = call({ a: 'admin', pin: 'test1234', op: 'list' });
chk(L.members.length === 3 && L.members.every(x => x.status === '대기'), '관리자 대기 목록 3명');
const row = p => L.members.find(x => x.portal === p).row;
['sean01', 'kim01', 'lee01'].forEach(p => { L = call({ a: 'admin', pin: 'test1234', op: 'approve', row: row(p) }); });
chk(call({ a: 'me', key: A }).me.status === '승인', '승인 후 상태 승인');
chk(book.tabs['회원'].d[3][2] === '=이브레이크', '이름은 텍스트로 저장(수식 아님)');
chk(!JSON.stringify(book.tabs['회원'].d).includes(A), '기기 키는 원문 저장 안 함');

// 2) 송금 수단 없으면 팟 못 엶
chk(call({ a: 'open', key: A, cafe: '더벤티 테크노폴리스점', mins: 20 }).error === 'nopay', '송금 수단 없으면 팟 열기 불가');
chk(call({ a: 'pay', key: A, toss: 'toss.me/seanpay', kakao: 'https://evil.com/x' }).error === 'kakao', '카카오 링크 형식 검증');
let r = call({ a: 'pay', key: A, toss: 'https://toss.me/seanpay', kakao: 'https://qr.kakaopay.com/Ej8abc123' });
chk(r.me.toss === 'seanpay' && r.me.kakao, '토스 아이디 정리 저장: ' + r.me.toss);

// 3) 팟 열기·주문
r = call({ a: 'open', key: A, cafe: '더벤티 테크노폴리스점', mins: 20, memo: '1층 로비' });
const pid = r.pid;
chk(pid && r.pots.length === 1 && r.pots[0].min === 9900 && r.pots[0].isOwner, '팟 열림, 최소주문 9,900');
chk(call({ a: 'open', key: A, cafe: '더벤티 테크노폴리스점', mins: 20 }).error === 'already', '한 사람당 열린 팟 1개');
chk(r.menu.length === 5 && r.menu[0].price === 2500, '기본 메뉴 5개');
r = call({ a: 'order', key: B, pid, items: [{ n: '(아이스)아메리카노', p: 100, q: 1 }] });
chk(r.pots[0].orders[0].amount === 2500, '가격은 서버 메뉴 기준(조작 무시)');
chk(call({ a: 'order', key: B, pid, items: [{ n: '없는메뉴', q: 1 }] }).error === 'menu', '없는 메뉴는 거절');
r = call({ a: 'order', key: B, pid, items: [{ n: '(아이스)아메리카노', q: 1, o: '샷추가' }, { n: '=말차라떼', p: 4500, q: 1, c: 1 }] });
const ob = r.pots[0].orders.find(o => o.mine);
chk(ob.amount === 7000 && r.pots[0].total === 7000, '직접 입력 포함 7,000원(덮어쓰기)');
chk(book.tabs['주문'].d.length === 2, '한 사람 한 줄');
chk(!JSON.stringify(r).includes('kim01') && !JSON.stringify(r).includes('sean01'), '응답에 PORTAL ID 없음');

// 4) 최소주문 미달
chk(call({ a: 'close', key: B, pid }).error === 'owner', '주인만 확정');
r = call({ a: 'close', key: A, pid });
chk(r.error === 'min' && r.short === 2900, '최소주문 미달 → 부족 2,900원');
call({ a: 'order', key: C, pid, items: [{ n: '(아이스)바닐라딥라떼', q: 1 }] });
r = call({ a: 'order', key: A, pid, items: [{ n: '아샤츄', q: 1 }] });
chk(r.pots[0].total === 15200 && r.pots[0].cups === 4, '합계 15,200 / 4잔');

// 5) 골든벨
r = call({ a: 'bell', key: C, pid, on: true });
chk(r.pots[0].bell === '=이브레이크' && r.pots[0].bellMine, '이브레이크 골든벨');
chk(call({ a: 'bell', key: B, pid, on: true }).error === 'taken', '이미 울린 골든벨은 다른 사람이 못 뺏음');
const pC = call({ a: 'state', key: C }).pots[0], pB = call({ a: 'state', key: B }).pots[0];
chk(pC.owe === 15200 && pB.owe === 0, '골든벨: 울린 사람이 전액, 나머지 0원');

// 6) 마감 지나면 주문 불가 → 연장
global.__NOW += 21 * 60000;
chk(call({ a: 'order', key: B, pid, items: [{ n: '아샤츄', q: 1 }] }).error === 'late', '마감 후 주문 불가');
chk(call({ a: 'state', key: A }).pots[0].expired, '마감 지남 표시');
call({ a: 'extend', key: A, pid, mins: 10 });
chk(call({ a: 'order', key: B, pid, items: [{ n: '(아이스)아메리카노', q: 1 }, { n: '=말차라떼', p: 4500, q: 1, c: 1 }] }).ok !== false, '연장 후 주문 가능');

// 7) 확정 → 주문 → 정산
r = call({ a: 'close', key: A, pid });
chk(r.pots[0].status === '확정', '주문 확정');
chk(call({ a: 'bell', key: B, pid, on: true }).error === 'closed', '확정 후 골든벨 불가');
r = call({ a: 'ordered', key: A, pid });
chk(r.pots[0].status === '주문완료', '주문완료 → 정산 시작');
chk(call({ a: 'sent', key: B, pid }).error === 'noowe', '골든벨 팟에선 일반 참여자 송금 없음');
r = call({ a: 'sent', key: C, pid });
chk(r.pots[0].bellPay.sent, '골든벨 송금 "보냈어요"');
r = call({ a: 'confirm', key: A, pid, id: 'bell' });
chk(r.pots[0].status === '정산완료', '주인 입금확인 → 정산완료');

// 8) 일반 팟(골든벨 없음) 정산
call({ a: 'pay', key: B, toss: 'kimpay' });
r = call({ a: 'open', key: B, cafe: '더벤티 테크노폴리스점', mins: 15 });
const p2 = r.pid;
call({ a: 'order', key: B, pid: p2, items: [{ n: '복숭아아이스티', q: 1 }] });
call({ a: 'order', key: A, pid: p2, items: [{ n: '(아이스)아메리카노', q: 2 }] });
call({ a: 'order', key: C, pid: p2, items: [{ n: '(아이스)바닐라딥라떼', q: 1 }] });
call({ a: 'close', key: B, pid: p2 }); call({ a: 'ordered', key: B, pid: p2 });
let sA = call({ a: 'state', key: A }).pots.find(p => p.pid === p2);
chk(sA.owe === 5000 && sA.pay.toss === 'kimpay', 'A는 5,000원 → 주인 토스로');
call({ a: 'sent', key: A, pid: p2 });
let sB = call({ a: 'state', key: B }).pots.find(p => p.pid === p2);
chk(sB.orders.find(o => o.name === 'Sean').sent, '주인 화면에 Sean 보냈어요 표시');
sB.orders.filter(o => !o.mine).forEach(o => { r = call({ a: 'confirm', key: B, pid: p2, id: o.id }); });
chk(r.pots.find(p => p.pid === p2).status === '정산완료', '모두 확인 → 자동 정산완료');

// 9) 빈 주문 = 취소
r = call({ a: 'open', key: C, cafe: '더벤티 테크노폴리스점', mins: 15 });
chk(r.error === 'nopay', '송금 수단 없는 사람은 팟 못 엶');

// 10) 리포트·명예의 전당
const rp = call({ a: 'report', key: C });
chk(rp.me.cups === 2 && rp.me.rang === 1 && rp.me.spent === 15200 + 4200 && rp.hall[0].name === '=이브레이크' && rp.hall[0].cups === 4,
  '리포트: ' + JSON.stringify(rp.me) + ' / ' + JSON.stringify(rp.hall));
const ra = call({ a: 'report', key: A });
chk(ra.me.got === 1 && ra.me.cups === 3 && ra.me.fav === '(아이스)아메리카노' && ra.me.icePct === 67, '리포트 A: ' + JSON.stringify(ra.me));

// 11) 기기 교체·사칭 방지
r = call({ a: 'join', portal: 'kim01', name: '김상신', key: B2 });
chk(r.me.status === '대기' && r.me.toss === 'kimpay', '새 기기 재신청은 대기(송금 수단 이어받음)');
chk(call({ a: 'state', key: B }).ok !== false, '재승인 전엔 이전 기기 그대로 사용');
L = call({ a: 'admin', pin: 'test1234', op: 'list' });
chk(L.members.find(x => x.portal === 'kim01' && x.status === '대기').dup === '김상신', '관리자에게 "이미 승인된 ID" 표시');
call({ a: 'admin', pin: 'test1234', op: 'approve', row: L.members.find(x => x.portal === 'kim01' && x.status === '대기').row });
chk(call({ a: 'state', key: B }).error === 'auth' && call({ a: 'state', key: B2 }).ok !== false, '새 기기 승인 → 이전 기기 차단');
call({ a: 'join', portal: 'sean01', name: 'Sean(가짜)', key: FAKE });
chk(call({ a: 'order', key: FAKE, pid: p2, items: [] }).error === 'auth', '승인 안 된 사칭 기기는 주문 불가');
L = call({ a: 'admin', pin: 'test1234', op: 'list' });
call({ a: 'admin', pin: 'test1234', op: 'block', row: L.members.find(x => x.name === 'Sean(가짜)').row });
chk(call({ a: 'join', portal: 'sean01', name: 'x', key: FAKE }).me.status === '차단', '차단된 기기는 재신청해도 차단');
chk(call({ a: 'state', key: A }).ok !== false, '진짜 Sean은 그대로');

// 12) PIN 무차별 대입 잠금
for (let i = 0; i < 10; i++) call({ a: 'admin', pin: 'x' + i });
chk(call({ a: 'admin', pin: 'test1234' }).error === 'locked', 'PIN 10회 실패 → 잠금');
chk(JSON.parse(doGet({ parameter: {} }).getContent()).ok, 'doGet 핑');
console.log(ok ? 'ALL OK' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
