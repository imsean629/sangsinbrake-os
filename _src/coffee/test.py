"""Playwright 종단 테스트: 가짜 시트(node ../gs_test/server.js) 위에서 실제 Apps Script 코드로
입장 신청 → 관리자 승인 → 팟 열기(송금 수단 등록) → 주문 → 최소주문 미달 → 골든벨 → 확정 → 정산 → 리포트·명예의 전당"""
import asyncio, json, os, subprocess, time, urllib.request
from playwright.async_api import async_playwright

H = os.path.dirname(os.path.abspath(__file__))
U = f"file://{H}/out/index_mock.html"
PORT = 8790
SRV = f"http://127.0.0.1:{PORT}"
os.makedirs(f"{H}/shots", exist_ok=True)

async def route(rt, req):
    data = req.post_data.encode() if req.post_data else None
    r = urllib.request.urlopen(urllib.request.Request(SRV + "/", data=data, method=req.method))
    await rt.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=r.read())

async def main():
    srv = subprocess.Popen(["node", "server.js", str(PORT)], cwd=f"{H}/../gs_test")
    time.sleep(0.8)
    ok = True; log = []; errs = []
    def chk(c, m):
        nonlocal ok; ok &= bool(c); log.append(("OK  " if c else "FAIL") + " " + m)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--allow-file-access-from-files"])
            async def user():
                ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, accept_downloads=True)
                await ctx.grant_permissions(["clipboard-read", "clipboard-write"])
                await ctx.route("https://mock.sheet.test/**", route)
                await ctx.route("https://cdn.jsdelivr.net/**", lambda r, q: r.abort())
                pg = await ctx.new_page()
                pg.on("pageerror", lambda e: errs.append(str(e)))
                pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
                await pg.add_init_script("navigator.share = undefined; navigator.canShare = undefined;")
                return pg
            A, B, C, ADM = await user(), await user(), await user(), await user()
            async def shot(pg, n): await pg.screenshot(path=f"{H}/shots/{n}.png", full_page=True)
            async def toast(pg): await pg.wait_for_timeout(250); return await pg.text_content("#toast")

            # 1) 입장 신청
            await A.goto(U); await shot(A, "01_join")
            for pg, pid, nm in [(A, "sean01", "Sean"), (B, "kim01", "김상신"), (C, "lee01", "이브레이크")]:
                if pg is not A: await pg.goto(U)
                await pg.fill("#jp", pid); await pg.fill("#jn", nm); await pg.click("#joinF button[type=submit]")
                await pg.wait_for_selector("#recheck")
            await shot(A, "02_wait")
            chk("승인 대기" in await A.text_content("h1"), "신청 후 승인 대기 화면")

            # 2) 관리자 승인
            await ADM.goto(U + "#admin"); await ADM.fill("#apin", "wrong"); await ADM.click("#af button")
            chk("PIN" in await toast(ADM), "관리자 PIN 오류 안내")
            await ADM.fill("#apin", "test1234"); await ADM.click("#af button")
            await ADM.wait_for_selector("[data-op=approve]"); await shot(ADM, "03_admin")
            chk(await ADM.locator("[data-op=approve]").count() == 3, "대기 3명 표시")
            for _ in range(3):
                await ADM.locator("[data-op=approve]").first.click(); await ADM.wait_for_timeout(300)
            chk(await ADM.locator("[data-op=block]").count() == 3, "3명 승인 완료")
            for pg in (A, B, C):
                await pg.click("#recheck"); await pg.wait_for_selector("#openBtn")
            await shot(A, "04_home_empty")
            chk("Sean님" in await A.text_content("h1"), "승인 후 홈 진입")

            # 3) 팟 열기 (송금 수단 먼저)
            await A.click("#openBtn"); await A.wait_for_selector("#psave")
            chk("받을 곳이 필요" in await A.text_content("#sheetBody h2"), "송금 수단 없으면 등록부터")
            await A.fill("#pk", "https://bad.link/x"); await A.click("#psave")
            chk("qr.kakaopay.com" in await toast(A), "카카오 링크 형식 안내")
            await A.fill("#pt", "toss.me/seanpay"); await A.fill("#pk", "https://qr.kakaopay.com/Ej8abc123"); await A.click("#psave")
            await A.wait_for_selector("#pgo"); await shot(A, "05_open_sheet")
            await A.fill("#pmemo", "1층 로비에서 받아요"); await A.click("#pgo")
            await A.wait_for_selector("#closeBtn")
            pid = (await A.evaluate("location.hash")).split("=", 1)[1]
            chk(pid, "팟 열림: " + pid)
            await shot(A, "06_pot_owner_empty")

            # 4) 주문 담기
            await B.goto(U + "#pot=" + pid); await B.reload(); await B.wait_for_selector("#orderBtn")
            await B.click("#orderBtn"); await B.wait_for_selector("[data-add]")
            await B.click("[data-add='(아이스)아메리카노']"); await B.click("[data-add='(아이스)아메리카노']")
            await shot(B, "07_menu_sheet")
            await B.click("#save"); await B.wait_for_selector("#cardwrap.on")
            await B.wait_for_timeout(300); await shot(B, "08_card")
            chk("2" in await B.text_content("#rc .k"), "결과 카드: 오늘 n번째 잔")
            async with B.expect_download() as dl:
                await B.click("#saveCard")
            d = await dl.value; chk(d.suggested_filename.endswith(".png"), "카드 이미지 저장 " + d.suggested_filename)
            await B.click("#closeCard")

            # 5) 최소주문 미달
            await A.reload(); await A.wait_for_selector("#closeBtn"); await A.click("#closeBtn")
            await A.wait_for_selector("#minAlert .alert"); await shot(A, "09_min_alert")
            chk("4,900원이 모자라요" in await A.text_content("#minAlert"), "최소주문 미달 4,900원 안내")

            # 6) 직접 입력 + 다른 주문
            await C.goto(U + "#pot=" + pid); await C.reload(); await C.wait_for_selector("#orderBtn")
            await C.click("#orderBtn"); await C.click("[data-tab='직접 입력']")
            await C.fill("#cn", "(아이스)카페라떼"); await C.fill("#co", "샷 추가"); await C.fill("#cp", "3,700"); await C.click("#addC")
            await C.click("[data-tab='인기']"); await C.click("[data-add='(아이스)바닐라딥라떼']")
            await shot(C, "10_custom_cart")
            await C.click("#save"); await C.wait_for_selector("#cardwrap.on"); await C.click("#closeCard")
            chk("12,900원" in await C.text_content(".hero"), "합계 12,900원")

            # 7) 골든벨
            await C.click("#bellOn"); await C.wait_for_selector("#ring"); await shot(C, "11_bell_confirm")
            await C.click("#ring"); await C.wait_for_selector(".banner")
            await shot(C, "12_bell_on")
            await B.goto(U); await B.reload(); await B.wait_for_selector(".pot")
            await shot(B, "13_home_bell")
            chk("이브레이크" in await B.text_content(".pot"), "홈에 골든벨 표시")

            # 8) 확정 → 주문 → 정산
            await A.reload(); await A.wait_for_selector("#closeBtn"); await A.click("#closeBtn")
            await A.wait_for_selector("#orderedBtn"); await shot(A, "14_order_sheet")
            chk("총 4잔" in await A.text_content(".sheetlist"), "주문서 총 4잔")
            await A.click("#orderedBtn"); await A.wait_for_selector("#finishBtn")
            await C.reload(); await C.wait_for_selector(".owe"); await shot(C, "15_settle_bell")
            chk("12,900원" in await C.text_content(".owe") and await C.get_attribute(".btn.toss", "href") == "https://toss.me/seanpay/12900", "골든벨 울린 사람이 전액 · 토스 링크 금액 포함")
            await C.click("[data-sent]"); await C.wait_for_timeout(300)
            await B.goto(U + "#pot=" + pid); await B.reload(); await B.wait_for_selector(".owe")
            chk("0원" in await B.text_content(".owe .amount"), "참여자는 0원")
            await A.reload(); await A.wait_for_selector("[data-conf=bell]"); await shot(A, "16_owner_settle")
            chk("보냈대요" in await A.text_content(".owe"), "주인 화면에 '보냈대요'")
            await A.click("[data-conf=bell]"); await A.wait_for_timeout(400)
            chk("정산 끝" in await A.text_content(".owe"), "입금 확인 → 정산 끝")

            # 9) 일반 정산 (골든벨 없음) — B가 팟
            await B.goto(U); await B.reload(); await B.wait_for_selector("#openBtn"); await B.click("#openBtn")
            await B.fill("#pt", "kimpay"); await B.click("#psave"); await B.wait_for_selector("#pgo"); await B.click("#pgo")
            await B.wait_for_selector("#closeBtn"); pid2 = (await B.evaluate("location.hash")).split("=", 1)[1]
            for pg in (A, C):
                await pg.goto(U + "#pot=" + pid2); await pg.reload(); await pg.wait_for_selector("#orderBtn")
                await pg.click("#orderBtn")
                if pg is A: await pg.click("#again") if await pg.locator("#again").count() else await pg.click("[data-add='아샤츄']")
                else: await pg.click("[data-add='복숭아아이스티']"); await pg.click("[data-add='복숭아아이스티']")
                await pg.click("#save"); await pg.wait_for_selector("#cardwrap.on"); await pg.click("#closeCard")
            await B.reload(); await B.wait_for_selector("#closeBtn"); await B.click("#closeBtn"); await B.wait_for_selector("#orderedBtn"); await B.click("#orderedBtn")
            await A.reload(); await A.wait_for_selector(".owe")
            chk(await A.get_attribute(".btn.toss", "href") == "https://toss.me/kimpay/4000" and await A.locator(".btn.kakao").count() == 0, "A → 김상신 토스 4,000원")
            await shot(A, "17_settle_normal")
            await A.click("[data-sent]"); await C.reload(); await C.wait_for_selector("[data-sent]"); await C.click("[data-sent]")
            await B.reload(); await B.wait_for_selector("[data-conf]")
            for i in range(2):
                await B.locator("[data-conf][aria-pressed=false]").first.click(); await B.wait_for_timeout(400)
            chk("정산 끝" in await B.text_content(".owe"), "모두 확인 → 자동 정산 끝")

            # 10) 리포트·명예의 전당
            await C.goto(U + "#report"); await C.reload(); await C.wait_for_selector("#repCard"); await shot(C, "18_report")
            chk("4잔" in await C.text_content(".rep") and "샷 추가" not in await C.text_content(".title-badge"), "C 리포트 4잔")
            await C.click("#repCard"); await C.wait_for_timeout(300); await shot(C, "19_report_card")
            await C.click("#closeCard")
            await C.goto(U + "#hall"); await C.wait_for_selector(".rank"); await shot(C, "20_hall")
            chk("이브레이크" in await C.text_content(".rank"), "명예의 전당 1위 이브레이크")

            # 11) 마감 시간 지남
            await A.goto(U); await A.reload(); await A.wait_for_selector("#openBtn"); await A.click("#openBtn"); await A.click("[data-m='10']"); await A.click("#pgo")
            await A.wait_for_selector("#closeBtn")
            urllib.request.urlopen(SRV + "/__now?add=11")
            await A.reload(); await A.wait_for_selector(".clock.late")
            chk(await A.locator("#orderBtn").count() == 0, "마감 지나면 메뉴 담기 버튼 없음")
            await A.click("#ext"); await A.wait_for_selector("#orderBtn")
            chk(True, "연장 후 다시 담기 가능")
            await shot(A, "21_extended")
            await B.goto(U); await B.reload(); await B.wait_for_selector(".pot"); await shot(B, "22_home_list")
            await b.close()
    finally:
        srv.terminate()
    chk(not errs, "페이지 오류 없음 " + "; ".join(errs[:3]))
    print("\n".join(log)); print("ALL OK" if ok else "SOME FAILED")
    return ok

if __name__ == "__main__":
    raise SystemExit(0 if asyncio.run(main()) else 1)
