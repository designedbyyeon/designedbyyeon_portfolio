#!/usr/bin/env python3
"""로컬 미리보기 서버.

- works/ 또는 tags.txt 가 바뀌면 자동으로 works.json 을 다시 만든다.
- 브라우저는 열려 있는 페이지가 알아서 새 데이터를 불러온다.

사용법: python serve.py [포트] [--no-open]  (또는 serve.bat 더블클릭)
"""
import functools
import importlib
import http.server
import sys
import threading
import time
import webbrowser

import build as builder
from build import ROOT, TAGS_FILE, WORKS_DIR

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
PORT = int(ARGS[0]) if ARGS else 8000
OPEN_BROWSER = "--no-open" not in sys.argv


def snapshot():
    paths = [TAGS_FILE, ROOT / "build.py"] + (list(WORKS_DIR.rglob("*")) if WORKS_DIR.exists() else [])
    state = []
    for p in paths:
        try:
            st = p.stat()
            state.append((str(p), st.st_mtime_ns, st.st_size))
        except FileNotFoundError:
            pass
    return sorted(state)


def watch():
    last = snapshot()
    while True:
        time.sleep(1)
        cur = snapshot()
        if cur != last:
            last = cur
            try:
                importlib.reload(builder)  # build.py 자체를 고쳐도 재시작 없이 반영
                builder.build()
            except Exception as e:  # 파일 저장 도중 등 일시적 오류로 서버가 죽지 않도록
                print(f"[build] 실패: {e}")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    builder.build()
    threading.Thread(target=watch, daemon=True).start()
    server = http.server.ThreadingHTTPServer(
        ("127.0.0.1", PORT), functools.partial(Handler, directory=str(ROOT))
    )
    url = f"http://localhost:{PORT}"
    print(f"[serve] {url}  (종료: Ctrl+C)")
    if OPEN_BROWSER:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
