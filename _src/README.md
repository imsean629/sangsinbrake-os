# sangsinbrake-os 제작 키트

이 폴더는 GitHub Pages에 공개되지 않아요(밑줄로 시작하는 폴더는 Jekyll이 제외).

| 경로 | 내용 | 주소 |
|---|---|---|
| `/index.html` | 앱 목록(첫 화면). `coffee/build_root.py`로 생성 | / |
| coffee | **SB COFFEE RUN**: 커피팟 열기·주문·최소주문 체크·SB 골든벨·정산·커피 포춘·나의 커피 리포트·명예의 전당 | /coffee/ · 관리자 /coffee/#admin |
| apps_script_Code.gs | 커피 앱 전용 Apps Script (새 시트, 기존 sean-sharon·leader 시트와 분리) | |
| gs_test/run.js | 가짜 Sheets로 Apps Script 단위 검증 (`node run.js`) | |
| gs_test/server.js | 가짜 Sheets 위에서 실제 .gs를 돌리는 로컬 서버(Playwright 종단 테스트용) | |

## 복원·빌드
```bash
pip install segno playwright pillow pyzbar --break-system-packages   # 크롬: /usr/bin/google-chrome
cd _src/gs_test && node run.js
cd ../coffee && python3 build.py "<웹앱 URL>" && python3 test.py && python3 build_root.py
```
- `build.py` → `../../coffee/index.html`(배포), `og.png`, `out/index_mock.html`(테스트). URL을 빼면 "미리보기: 시트 미연결" 모드.
- `test.py`는 `gs_test/server.js`를 띄우고 `https://mock.sheet.test/**`를 그쪽으로 넘겨 **실제 Apps Script 코드**로 4명(주인·참여자·골든벨·관리자)을 돌림. 스크린샷은 `shots/`.

## 구조
- 단일 HTML(데이터·로고·html2canvas 인라인). 글꼴 Pretendard(CDN).
- 디자인: 에스프레소 다크(#1C120D/#2A1C15), 크림 글자 #F3E5CF, 브랜드 계열 빨강 #E8333B·파랑 #3E6BE0, 골든벨 금색 #F2B544. 로고는 원본 그대로 흰 바탕 알약 위에. 시그니처 = **컵 게이지**(최소주문선 점선, 채워지는 커피, 골든벨이면 금색).
- 통신: `fetch(SHEET_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({a, key, ...})})` → JSON 응답(읽기·쓰기 모두 POST, no-cors 아님).
- 입장: PORTAL ID + 이름 → '회원' 탭 대기 → 관리자 승인(#admin, PIN) 또는 시트에서 상태='승인'. 휴대폰마다 무작위 기기 키(localStorage `sbc_key`), 시트엔 SHA-256 해시만. 주문 이름은 서버가 키로 붙임(사칭 불가). 같은 PORTAL ID 새 기기 승인 시 이전 기기는 '교체됨'.
- 팟: 송금 수단(토스 아이디 / 카카오페이 송금 링크) 등록자만 열 수 있음. 1인 1개 모집 팟. 마감 5~180분, 연장 10분. 상태 모집 → 확정 → 주문완료 → 정산완료(또는 취소).
- 주문: 한 사람이 한 팟에 한 줄(oid = pid_portal, 덮어쓰기, 빈 주문 = 빼기). 기본 메뉴 가격은 서버 '메뉴' 탭 기준으로 다시 계산(조작 무시). 직접 입력은 100~50,000원.
- 최소주문: '카페' 탭의 최소주문(더벤티 9,900). 미달이면 확정 거절 + 부족액 안내.
- SB 골든벨: 모집 중 아무나 1명. 울린 사람이 전액(주인이 울리면 송금 없음), 나머지 0원. 마감 전까지 본인만 취소.
- 정산: 토스 링크 `https://toss.me/<아이디>/<금액>`, 카카오페이는 링크 열기 + 금액 복사. 참여자 "보냈어요" → 주인 "입금 확인" → 모두 확인되면 자동 정산완료.
- 커피 포춘: 날짜+이름 해시(하루 고정). 리포트/명예의 전당: 이번 달 주문완료·정산완료 팟만.
- 보안: 문자열은 모두 `'` 접두로 저장(수식 주입 방지), 응답에 PORTAL ID·키 없음, 관리자 PIN 10회 실패 시 10분 잠금. **ADMIN_PIN은 저장소 파일에선 비워 두고 배포본에만 입력.**
