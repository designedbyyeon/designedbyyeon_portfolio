#!/usr/bin/env python3
"""works/ 폴더와 tags.txt를 읽어 사이트가 사용하는 works.json을 생성한다.

사용법: python build.py
"""
import datetime
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORKS_DIR = ROOT / "works"
TAGS_FILE = ROOT / "tags.txt"
OUT_FILE = ROOT / "works.json"
INFO_NAME = "info.txt"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}

# info.txt 에서 인식하는 항목 (한글/영문 모두 가능, 띄어쓰기 무시)
KEY_ALIASES = {
    "프로젝트명": "title", "제목": "title", "title": "title",
    "태그": "tags", "tags": "tags",
    "연도": "year", "year": "year",
    "클라이언트": "client", "client": "client",
    "순서": "order", "order": "order",
    "대표이미지": "cover", "cover": "cover",
    "유튜브": "youtube", "영상": "youtube", "youtube": "youtube",
}

# youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID, /live/ID
YOUTUBE_RE = re.compile(
    r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/))([\w-]{11})"
)


def read_text(path):
    """UTF-8 우선, 실패하면 윈도우 메모장 기본(ANSI/CP949)으로 읽는다."""
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp949"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return raw.decode("utf-8", errors="replace")


def split_tags(value):
    """'레터링, 광고' 와 '레터링 / 광고' 둘 다 허용. 중복 제거, 순서 유지.

    붙여 쓴 '/'는 태그 이름의 일부로 본다 → '방송/영화'는 태그 하나.
    """
    tags = []
    for t in re.split(r",|\s+/\s+", value):
        t = t.strip()
        if t and t not in tags:
            tags.append(t)
    return tags


def natural_key(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def parse_info(text):
    """헤더(키: 값) 줄들 + '---' 또는 빈 줄 이후의 설명 본문."""
    meta, extra, body = {}, {}, []
    in_body = False
    for line in text.splitlines():
        if in_body:
            body.append(line)
            continue
        stripped = line.strip()
        if stripped == "---" or (not stripped and (meta or extra)):
            in_body = True
            continue
        m = re.match(r"\s*([^:：]+?)\s*[:：]\s*(.*)$", line)
        if m:
            raw_key = m.group(1).strip()
            key = KEY_ALIASES.get(raw_key.lower().replace(" ", ""))
            value = m.group(2).strip()
            if key == "youtube":  # 여러 줄/여러 개 허용
                meta.setdefault("youtube", []).extend(re.split(r"[\s,]+", value))
            else:
                (meta if key else extra)[key or raw_key] = value
        elif stripped:
            # 키 형식이 아닌 줄이 나오면 그때부터 본문으로 본다
            in_body = True
            body.append(line)
    return meta, extra, "\n".join(body).strip()


def parse_tag_entry(entry):
    """'한글레터링 #edc92f = 레터링' → ('한글레터링', '#edc92f', ['레터링'])

    '=' 뒤는 별칭: txt 파일에 별칭으로 적어도 앞의 이름으로 표시된다.
    """
    name, *aliases = [x.strip() for x in entry.split("=")]
    m = re.match(r"^(.*?)\s+(#[0-9a-fA-F]{3,8})$", name)
    tag, color = (m.group(1).strip(), m.group(2)) if m else (name, None)
    return tag, color, [a for a in aliases if a]


def parse_tag_groups(text):
    groups, cur = [], None
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        m = re.match(r"^\[(.+)\]$", s)
        if m:
            cur = {"name": m.group(1).strip(), "tags": [], "colors": {}, "aliases": {}}
            groups.append(cur)
            continue
        if cur is None:
            cur = {"name": "태그", "tags": [], "colors": {}, "aliases": {}}
            groups.append(cur)
        for entry in split_tags(s):
            tag, color, aliases = parse_tag_entry(entry)
            if tag not in cur["tags"]:
                cur["tags"].append(tag)
            if color:
                cur["colors"][tag] = color
            for a in aliases:
                cur["aliases"][a] = tag
    return groups


def find_info_file(folder, warnings):
    """info.txt > '폴더이름.txt' > 폴더 안의 유일한 .txt"""
    txts = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".txt")
    for name in (INFO_NAME, f"{folder.name}.txt"):
        match = next((p for p in txts if p.name.lower() == name.lower()), None)
        if match:
            return match
    if len(txts) == 1:
        return txts[0]
    if txts:
        warnings.append(f"[{folder.name}] txt 파일이 여러 개라 어느 것을 쓸지 모름: {', '.join(p.name for p in txts)}")
    return None


def load_work(folder, warnings):
    rel = lambda p: p.relative_to(ROOT).as_posix()
    images = sorted(
        (p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXT),
        key=lambda p: natural_key(p.name),
    )
    info_path = find_info_file(folder, warnings)
    if info_path:
        meta, extra, description = parse_info(read_text(info_path))
    else:
        meta, extra, description = {}, {}, ""
        warnings.append(f"[{folder.name}] 설명 txt 파일 없음 → 폴더 이름을 제목으로 사용")

    tags = split_tags(meta.get("tags", ""))
    if not tags:
        warnings.append(f"[{folder.name}] 태그 없음")
    if not images:
        warnings.append(f"[{folder.name}] 이미지 없음")
    heavy = [p.name for p in images if p.stat().st_size > 2 * 1024 * 1024]
    if heavy:
        warnings.append(f"[{folder.name}] 2MB 넘는 이미지 {len(heavy)}개 → optimize_images.py 실행 추천")

    # 대표 이미지: info.txt 지정 > 파일명이 cover.* > 첫 번째 이미지
    cover = None
    if meta.get("cover"):
        cover = next((p for p in images if p.name == meta["cover"]), None)
        if cover is None:
            warnings.append(f"[{folder.name}] 대표이미지 '{meta['cover']}' 파일을 찾을 수 없음")
    cover = cover or next((p for p in images if p.stem.lower() == "cover"), None)
    cover = cover or (images[0] if images else None)
    if cover:
        images.remove(cover)
        images.insert(0, cover)

    videos = []
    for url in filter(None, meta.get("youtube", [])):
        m = YOUTUBE_RE.search(url)
        if m:
            videos.append({"id": m.group(1), "url": url, "vertical": "/shorts/" in url})
        else:
            warnings.append(f"[{folder.name}] 유튜브 주소를 인식할 수 없음: {url}")

    order = meta.get("order", "")
    try:
        order = int(order)
    except ValueError:
        if order:
            warnings.append(f"[{folder.name}] 순서 '{order}' 는 숫자가 아님 → 무시")
        order = None

    return {
        "id": folder.name,
        "title": meta.get("title") or folder.name,
        "year": meta.get("year", ""),
        "client": meta.get("client", ""),
        "order": order,
        "tags": tags,
        "description": description,
        "extra": extra,
        "videos": videos,
        "cover": rel(cover) if cover else None,
        "images": [rel(p) for p in images],
    }


def build(verbose=True):
    warnings = []
    WORKS_DIR.mkdir(exist_ok=True)
    folders = [
        p for p in WORKS_DIR.iterdir()
        if p.is_dir() and not p.name.startswith(("_", "."))  # _로 시작하면 비공개(임시저장)
    ]
    works = [load_work(f, warnings) for f in folders]
    works.sort(key=lambda w: natural_key(w["id"]))
    works.sort(key=lambda w: w["year"], reverse=True)
    works.sort(key=lambda w: w["order"] if w["order"] is not None else float("inf"))

    groups = parse_tag_groups(read_text(TAGS_FILE)) if TAGS_FILE.exists() else []

    # 별칭 → 표시 이름 (예: 레터링 → 한글레터링)
    aliases = {a: t for g in groups for a, t in g.pop("aliases").items()}
    for w in works:
        mapped = []
        for t in w["tags"]:
            t = aliases.get(t, t)
            if t not in mapped:
                mapped.append(t)
        w["tags"] = mapped

    # 태그 그룹: tags.txt 정의 순서 + 정의되지 않은 태그는 마지막 줄로
    used = []
    for w in works:
        used += [t for t in w["tags"] if t not in used]
    grouped = {t for g in groups for t in g["tags"]}
    for g in groups:
        unused = [t for t in g["tags"] if t not in used]
        if unused:
            warnings.append(f"tags.txt [{g['name']}] 에 있지만 쓰이지 않는 태그: {', '.join(unused)}")
        g["tags"] = [{"name": t, "color": g["colors"].get(t)} for t in g["tags"] if t in used]
        del g["colors"]
    # tags.txt에 없는 태그는 마지막 그룹(장르)에 회색으로 붙인다
    others = [t for t in used if t not in grouped]
    if others:
        warnings.append(f"tags.txt에 없는 태그 → 마지막 줄에 추가: {', '.join(others)}")
        if not groups:
            groups.append({"name": "태그", "tags": []})
        groups[-1]["tags"] += [{"name": t, "color": None} for t in others]
    groups = [g for g in groups if g["tags"]]

    data = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "tagGroups": groups,
        "works": works,
    }
    OUT_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    if verbose:
        print(f"[build] 작업 {len(works)}개, 태그 {len(used)}개 → {OUT_FILE.name}")
        for w in warnings:
            print(f"  ! {w}")
    return data


if __name__ == "__main__":
    build()
