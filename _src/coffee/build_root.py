"""저장소 첫 화면(/index.html) — 앱 목록. python3 build_root.py"""
import base64, io, os
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(f"{H}/../..")
im = Image.open(f"{H}/logo.png").convert("RGBA").resize((720, 72), Image.LANCZOS); b = io.BytesIO(); im.save(b, "PNG", optimize=True)
LOGO = "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()
APPS = [("coffee/", "SB COFFEE RUN", "커피팟 열기·주문·정산, SB 골든벨")]
items = "".join(f'<a class="app" href="{u}"><b>{t}</b><span>{d}</span></a>' for u, t, d in APPS)
open(f"{ROOT}/index.html", "w").write(f"""<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="#1C120D"><title>SANGSIN BRAKE · 해외사업부</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>body{{margin:0;background:#1C120D;color:#F3E5CF;font-family:"Pretendard Variable",Pretendard,sans-serif;word-break:keep-all}}
main{{max-width:440px;margin:0 auto;padding:24px 20px}}.logo{{display:inline-block;background:#fff;border-radius:999px;padding:8px 16px}}.logo img{{height:16px;display:block}}
h1{{font-size:28px;letter-spacing:-.04em;margin:28px 0 18px}}.app{{display:block;background:#2A1C15;border-radius:18px;padding:18px;color:inherit;text-decoration:none;margin-bottom:10px}}
.app b{{display:block;font-size:18px}}.app span{{color:#BCA58C;font-size:14px}}.app:focus-visible{{outline:2px solid #F2B544}}</style></head>
<body><main><span class="logo"><img src="{LOGO}" alt="SANGSIN BRAKE"></span><h1>해외사업부 앱</h1>{items}</main></body></html>""")
print("root index ok")
