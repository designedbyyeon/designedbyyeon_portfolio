#!/usr/bin/env python3
"""works/ 안의 이미지를 웹용으로 줄인다. (원본 파일은 변환 후 삭제됨)

- 가로 2000px보다 크면 2000px로 줄임 (세로는 비율대로)
- PNG / JPG / JPEG → WebP (투명 배경 유지, 용량은 훨씬 작음)
- 이미 WebP이고 크기가 적당한 파일은 건너뜀 → 여러 번 실행해도 안전
- GIF(움직이는 이미지)와 SVG는 건드리지 않음

사용법: python optimize_images.py   (또는 optimize.bat 더블클릭)
필요: pip install pillow
"""
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow가 필요합니다:  pip install pillow")

ROOT = Path(__file__).resolve().parent
WORKS_DIR = ROOT / "works"
MAX_WIDTH = 2000
QUALITY = 82
WEBP_MAX_SIDE = 16383  # WebP 형식의 한계
CONVERT_EXT = {".png", ".jpg", ".jpeg", ".webp"}


def optimize(path):
    """변환했으면 (전 크기, 후 크기), 건너뛰면 None"""
    before = path.stat().st_size
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)  # 휴대폰 사진 회전 정보 반영
        if path.suffix.lower() == ".webp" and im.width <= MAX_WIDTH:
            return None
        if im.width > MAX_WIDTH:
            im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)), Image.LANCZOS)
        has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if has_alpha else "RGB")
        # 완전히 불투명한 PNG는 알파 채널을 버려 용량 절약
        if has_alpha and im.getchannel("A").getextrema() == (255, 255):
            im = im.convert("RGB")

        if max(im.size) <= WEBP_MAX_SIDE:
            out = path.with_suffix(".webp")
            im.save(out, "WEBP", quality=QUALITY, method=5)
        else:  # 아주 긴 세로 이미지는 WebP에 안 들어가므로 JPG로
            out = path.with_suffix(".jpg")
            im.convert("RGB").save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)

    if out != path:
        path.unlink()
    return before, out.stat().st_size


def main():
    files = sorted(
        p for p in WORKS_DIR.rglob("*")
        if p.is_file() and p.suffix.lower() in CONVERT_EXT
    )
    total_before = total_after = done = 0
    for i, p in enumerate(files, 1):
        try:
            result = optimize(p)
        except Exception as e:
            print(f"  ! 실패: {p.relative_to(ROOT)} ({e})")
            continue
        if result:
            done += 1
            total_before += result[0]
            total_after += result[1]
        if i % 50 == 0 or i == len(files):
            print(f"  {i}/{len(files)} 처리")
    mb = lambda b: b / 1024 / 1024
    print(f"[optimize] {done}개 변환: {mb(total_before):.0f}MB → {mb(total_after):.0f}MB")


if __name__ == "__main__":
    main()
