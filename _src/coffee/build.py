"""SB COFFEE RUN 빌드: data.py + template.html + logo.png → ../../coffee/index.html (배포), out/index_mock.html (테스트)
사용: python3 build.py "<Apps Script 웹앱 URL>"   (생략하면 아래 SHEET 값, 비어 있으면 미리보기 모드)
og.png(1200×630)도 함께 만듭니다."""
import base64, io, json, os, sys
from PIL import Image
from data import APP, URL, FORTUNES, TITLES, BELL_BADGE, ERR

H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(f"{H}/../..")
SHEET = sys.argv[1] if len(sys.argv) > 1 else ""
os.makedirs(f"{H}/out", exist_ok=True); os.makedirs(f"{ROOT}/coffee", exist_ok=True)

def png64(im):
    b = io.BytesIO(); im.save(b, "PNG", optimize=True); return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()

logo = Image.open(f"{H}/logo.png").convert("RGBA")          # 원본 그대로, 크기만 줄임
small = logo.resize((720, round(720 * logo.height / logo.width)), Image.LANCZOS)
mark = logo.crop((0, 0, logo.height * 1.5, logo.height))     # 왼쪽 SB 마크 → 파비콘
icon = Image.new("RGBA", (192, 192), "#ffffff"); m = mark.resize((150, 100), Image.LANCZOS); icon.paste(m, (21, 46), m)
J = lambda o: json.dumps(o, ensure_ascii=False)
h2c = open(f"{H}/../vendor/html2canvas.min.js").read().replace("</script", "<\\/script")

s = open(f"{H}/template.html").read()
for k, v in {"FORTUNES": FORTUNES, "TITLES": TITLES, "BELL_BADGE": BELL_BADGE, "ERR": ERR}.items():
    s = s.replace(f"/*__{k}__*/null", J(v))
s = (s.replace("/*__H2C__*/", h2c).replace("__LOGO__", png64(small)).replace("__ICON__", png64(icon.resize((64, 64))))
      .replace("__URL__", URL).replace("__APP__", APP))
assert "/*__" not in s and "__LOGO__" not in s
real = s.replace('SHEET_URL: ""', f'SHEET_URL: "{SHEET}"') if SHEET else s
open(f"{ROOT}/coffee/index.html", "w").write(real)
mock = s.replace('SHEET_URL: ""', 'SHEET_URL: "https://mock.sheet.test/exec"')
open(f"{H}/out/index_mock.html", "w").write(mock)
open(f"{H}/out/index_preview.html", "w").write(s)

# og.png
og = f"""<html><head><meta charset=utf-8><style>body{{margin:0;width:1200px;height:630px;background:#1C120D;color:#F3E5CF;font-family:'Noto Sans CJK KR',sans-serif;display:flex;align-items:center;padding:0 90px;box-sizing:border-box;gap:70px}}
.l{{background:#fff;border-radius:999px;padding:14px 28px;display:inline-block}}.l img{{height:30px;display:block}}
h1{{font-size:86px;line-height:1.1;margin:34px 0 16px;letter-spacing:-4px;font-weight:900}}p{{font-size:32px;color:#BCA58C;margin:0}}
.cup{{width:250px;height:320px;position:relative;flex:none}}.g{{position:absolute;inset:0;border:6px solid #F3E5CF;border-top:0;border-radius:10px 10px 90px 90px;overflow:hidden;clip-path:polygon(0 0,100% 0,92% 100%,8% 100%)}}
.q{{position:absolute;left:0;right:0;bottom:0;height:82%;background:linear-gradient(to top,#B7740A,#F2B544 70%,#FFE29A)}}.r{{position:absolute;left:-12px;right:-12px;top:-5px;height:10px;border-radius:5px;background:#F3E5CF}}
.d{{position:absolute;left:-14px;right:-14px;top:22%;border-top:3px dashed #BCA58C}}</style></head><body>
<div><span class=l><img src="{png64(small)}"></span><h1>오늘 커피,<br>누가 모아?</h1><p>{APP} · 커피팟 주문·정산·골든벨</p></div>
<div class=cup><div class=g><div class=q></div></div><div class=d></div><div class=r></div></div></body></html>"""
open(f"{H}/out/og.html", "w").write(og)
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome"); pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.goto(f"file://{H}/out/og.html"); pg.screenshot(path=f"{ROOT}/coffee/og.png"); b.close()
except Exception as e:
    print("og.png 건너뜀:", e)
print("built", os.path.getsize(f"{ROOT}/coffee/index.html") // 1024, "KB | sheet:", SHEET or "(미연결·미리보기)")
