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

# info.txt 에서 인식하는 항목 (한글/영문 모두 가능)
KEY_ALIASES = {
    "제목": "title", "title": "title",
    "태그": "tags", "tags": "tags",
    "연도": "year", "year": "year",
    "클라이언트": "client", "client": "client",
    "역할": "role", "role": "role",
    "순서": "order", "order": "order",
    "대표이미지": "cover", "cover": "cover",
}


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
    """'레터링, 광고' 와 '레터링 / 광고' 둘 다 허용. 중복 제거, 순서 유지."""
    tags = []
    for t in re.split(r"[,/]", value):
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
            key = KEY_ALIASES.get(raw_key.lower())
            (meta if key else extra)[key or raw_key] = m.group(2).strip()
        elif stripped:
            # 키 형식이 아닌 줄이 나오면 그때부터 본문으로 본다
            in_body = True
            body.append(line)
    return meta, extra, "\n".join(body).strip()


def parse_tag_groups(text):
    groups, cur = [], None
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        m = re.match(r"^\[(.+)\]$", s)
        if m:
            cur = {"name": m.group(1).strip(), "tags": []}
            groups.append(cur)
            continue
        if cur is None:
            cur = {"name": "태그", "tags": []}
            groups.append(cur)
        cur["tags"] += [t for t in split_tags(s) if t not in cur["tags"]]
    return groups


def load_work(folder, warnings):
    rel = lambda p: p.relative_to(ROOT).as_posix()
    images = sorted(
        (p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXT),
        key=lambda p: natural_key(p.name),
    )
    info_path = folder / INFO_NAME
    if info_path.exists():
        meta, extra, description = parse_info(read_text(info_path))
    else:
        meta, extra, description = {}, {}, ""
        warnings.append(f"[{folder.name}] {INFO_NAME} 없음 → 폴더 이름을 제목으로 사용")

    tags = split_tags(meta.get("tags", ""))
    if not tags:
        warnings.append(f"[{folder.name}] 태그 없음")
    if not images:
        warnings.append(f"[{folder.name}] 이미지 없음")

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
        "role": meta.get("role", ""),
        "order": order,
        "tags": tags,
        "description": description,
        "extra": extra,
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

    # 태그 그룹: tags.txt 정의 순서 + 정의되지 않은 태그는 '기타'로
    used = []
    for w in works:
        used += [t for t in w["tags"] if t not in used]
    groups = parse_tag_groups(read_text(TAGS_FILE)) if TAGS_FILE.exists() else []
    grouped = {t for g in groups for t in g["tags"]}
    for g in groups:
        unused = [t for t in g["tags"] if t not in used]
        if unused:
            warnings.append(f"tags.txt [{g['name']}] 에 있지만 쓰이지 않는 태그: {', '.join(unused)}")
        g["tags"] = [t for t in g["tags"] if t in used]
    others = [t for t in used if t not in grouped]
    if others:
        groups.append({"name": "기타", "tags": others})
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
