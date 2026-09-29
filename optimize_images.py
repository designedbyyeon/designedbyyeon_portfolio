#!/usr/bin/env python3
"""works/, activities/ 안의 이미지와 영상을 웹용으로 줄인다. (원본 파일은 변환 후 삭제됨)

이미지
- 가로 2000px보다 크면 2000px로 줄임 (세로는 비율대로)
- PNG / JPG / JPEG → WebP (투명 배경 유지, 용량은 훨씬 작음)
- 이미 WebP이고 크기가 적당한 파일은 건너뜀
- GIF(움직이는 이미지)와 SVG는 건드리지 않음

영상 (mp4, mov, m4v, webm, avi, mkv)
- MP4(H.264)로 변환: 모든 브라우저·폰에서 재생
- 가로 1920px 이하, 최대 30fps, 모션그래픽에 맞춘 화질(CRF 24)
- 소리가 있으면 유지(AAC), 없으면 뺌
- 투명 배경 영상은 VIDEO_ALPHA_BG 색(기본 검정) 위에 합성
- 영상 중간 장면을 '영상이름.poster.webp'로 저장 (목록·PDF에서 대표 장면으로 사용)
- 한 번 변환한 영상은 표시를 남겨 다음부터 건너뜀

여러 번 실행해도 안전합니다.

사용법: python optimize_images.py   (또는 optimize.bat 더블클릭)
필요: pip install pillow imageio-ffmpeg
"""
import json
import re
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow가 필요합니다:  pip install pillow")

ROOT = Path(__file__).resolve().parent
DIRS = [ROOT / "works", ROOT / "activities"]

# 이미지
MAX_WIDTH = 2000
QUALITY = 82
WEBP_MAX_SIDE = 16383  # WebP 형식의 한계
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}

# 영상
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
VIDEO_MAX_WIDTH = 1920
VIDEO_MAX_FPS = 30
VIDEO_CRF = 24          # 낮을수록 고화질·고용량 (18~28 권장)
AUDIO_BITRATE = "128k"
DONE_MARK = "designedbyyeon-web"  # 변환한 영상에 남기는 표시 (다시 변환하지 않도록)
# 투명 배경이 있는 영상(ProRes 4444 등)은 MP4에 투명을 담을 수 없어 이 색 위에 합성한다.
# 흰 글씨·장식이 있는 모션 타이틀이 많아 검정이 기본. 밝은 배경이 필요하면 "0xfcfcfc"(사이트 배경색)
VIDEO_ALPHA_BG = "black"


# ---------- 이미지 ----------
def optimize_image(path):
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


# ---------- 영상 ----------
def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return None


def probe(ff, path):
    """ffmpeg 출력에서 길이·해상도·fps·소리·변환 표시를 읽는다."""
    r = subprocess.run([ff, "-hide_banner", "-i", str(path)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    info = r.stderr
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    vid = re.search(r"Video: (\w+).*?, (\d{2,5})x(\d{2,5})", info)
    fps = re.search(r"([\d.]+) fps", info)
    return {
        "duration": int(dur[1]) * 3600 + int(dur[2]) * 60 + float(dur[3]) if dur else 0,
        "codec": vid[1] if vid else "",
        "width": int(vid[2]) if vid else 0,
        "height": int(vid[3]) if vid else 0,
        "fps": float(fps[1]) if fps else 0,
        "audio": "Audio:" in info,
        "alpha": bool(re.search(r"Video: [^\n]*?\b(yuva\w*|rgba|argb|bgra|abgr|gbrap\w*|ya8|ya16\w*)", info)),
        "done": DONE_MARK in info,
    }


def make_poster(ff, video, info):
    """영상 중간 장면을 대표 이미지로 (로고 애니메이션은 처음이 비어 있는 경우가 많아서)"""
    poster = video.with_name(video.stem + ".poster.webp")
    at = f"{info['duration'] * 0.5:.2f}" if info["duration"] else "0"
    tmp = video.with_name(video.stem + ".poster.png")
    subprocess.run([ff, "-y", "-loglevel", "error", "-ss", at, "-i", str(video), "-frames:v", "1", str(tmp)], check=True)
    with Image.open(tmp) as im:
        if im.width > MAX_WIDTH:
            im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)), Image.LANCZOS)
        im.convert("RGB").save(poster, "WEBP", quality=QUALITY, method=5)
    tmp.unlink()


def optimize_video(ff, path):
    """변환했으면 (전 크기, 후 크기), 건너뛰면 None"""
    info = probe(ff, path)
    out = path.with_suffix(".mp4")
    if info["done"] and path.suffix.lower() == ".mp4":
        if not path.with_name(path.stem + ".poster.webp").exists():
            make_poster(ff, path, info)
        return None

    before = path.stat().st_size
    tmp = path.with_name(path.stem + ".tmp.mp4")
    filters = [f"scale='min({VIDEO_MAX_WIDTH},iw)':-2"]
    if info["fps"] > VIDEO_MAX_FPS + 0.5:
        filters.append(f"fps={VIDEO_MAX_FPS}")
    if info["alpha"]:
        # 투명 부분을 배경색으로 채움 (그냥 변환하면 투명 부분 색이 제멋대로 나옴)
        # 배경 색 화면도 원본과 같은 fps로 만들어야 프레임 수가 바뀌지 않음
        rate = min(info["fps"], VIDEO_MAX_FPS) if info["fps"] else VIDEO_MAX_FPS
        # 배경은 처음부터 최종 크기로 만든다 (크기를 나중에 맞추면 화면 비율 정보가 틀어져 영상이 찌그러짐)
        w = min(VIDEO_MAX_WIDTH, info["width"]) // 2 * 2
        h = round(info["height"] * w / info["width"] / 2) * 2
        fg = [f"scale={w}:{h}", *filters[1:]]
        graph = (f"[0:v]{','.join(fg)}[fg];color=c={VIDEO_ALPHA_BG}:s={w}x{h}:r={rate}[bg];"
                 f"[bg][fg]overlay=shortest=1,setsar=1,format=yuv420p[out]")
        video_args = ["-filter_complex", graph, "-map", "[out]", "-map", "0:a?"]
    else:
        video_args = ["-vf", ",".join(filters), "-map", "0:v:0", "-map", "0:a?"]
    cmd = [
        ff, "-y", "-loglevel", "error", "-i", str(path),
        *video_args,
        "-c:v", "libx264", "-preset", "slow", "-crf", str(VIDEO_CRF),
        "-pix_fmt", "yuv420p", "-profile:v", "high",
        *(["-c:a", "aac", "-b:a", AUDIO_BITRATE] if info["audio"] else ["-an"]),
        "-movflags", "+faststart",           # 받는 즉시 재생 시작
        "-metadata", f"comment={DONE_MARK}",
        str(tmp),
    ]
    subprocess.run(cmd, check=True)

    # 이미 효율적인 영상이라 다시 압축한 게 더 크면, 원본을 그대로 쓰되 표시만 남긴다
    if tmp.stat().st_size >= before and path.suffix.lower() == ".mp4" and info["codec"] == "h264" and info["width"] <= VIDEO_MAX_WIDTH:
        subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(path), "-c", "copy",
                        "-movflags", "+faststart", "-metadata", f"comment={DONE_MARK}", str(tmp)], check=True)

    path.unlink()
    tmp.replace(out)
    make_poster(ff, out, probe(ff, out))
    return before, out.stat().st_size


# ---------- 실행 ----------
def main():
    files = sorted(p for d in DIRS if d.exists() for p in d.rglob("*") if p.is_file())
    images = [p for p in files if p.suffix.lower() in IMAGE_EXT and not p.name.endswith(".poster.webp")]
    videos = [p for p in files if p.suffix.lower() in VIDEO_EXT and not p.name.endswith(".tmp.mp4")]
    mb = lambda b: b / 1024 / 1024

    total_before = total_after = done = 0
    for i, p in enumerate(images, 1):
        try:
            result = optimize_image(p)
        except Exception as e:
            print(f"  ! 실패: {p.relative_to(ROOT)} ({e})")
            continue
        if result:
            done += 1
            total_before += result[0]
            total_after += result[1]
        if i % 50 == 0 or i == len(images):
            print(f"  이미지 {i}/{len(images)} 처리")
    print(f"[이미지] {done}개 변환: {mb(total_before):.0f}MB → {mb(total_after):.0f}MB")

    if not videos:
        return
    ff = ffmpeg_exe()
    if not ff:
        print(f"[영상] {len(videos)}개가 있지만 변환 도구가 없습니다:  pip install imageio-ffmpeg")
        return
    total_before = total_after = done = 0
    for p in videos:
        print(f"  영상 처리 중: {p.relative_to(ROOT)}")
        try:
            result = optimize_video(ff, p)
        except Exception as e:
            print(f"  ! 실패: {p.relative_to(ROOT)} ({e})")
            continue
        if result:
            done += 1
            total_before += result[0]
            total_after += result[1]
            print(f"    {mb(result[0]):.1f}MB → {mb(result[1]):.1f}MB")
    print(f"[영상] {done}개 변환: {mb(total_before):.1f}MB → {mb(total_after):.1f}MB")


if __name__ == "__main__":
    main()
