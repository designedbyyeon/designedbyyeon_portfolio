// 선택된 작업들을 A4 가로 PDF로 만든다 (표지 1p + 프로젝트당 1p).
// 각 페이지를 캔버스에 그린 뒤 이미지로 PDF에 넣기 때문에
// 한글 폰트를 PDF에 따로 넣지 않아도 글자가 깨지지 않는다.
const PDF_SITE_NAME = "designedbyyeon";
const PAGE = { w: 1754, h: 1240, m: 90 }; // A4 가로, 150dpi 기준 픽셀
const PDF_LOGO = "source/logo.svg";
const LOGO_RATIO = 1470.17 / 659.86; // logo.svg viewBox 가로/세로
const FONT = '"Pretendard Variable", Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const COLOR = { bg: "#fcfcfc", fg: "#000", muted: "#777", line: "#000", chip: "#c9c9c9", imgBg: "#efefef" };

const imageCache = new Map();
function loadImage(path) {
  if (!path) return Promise.resolve(null);
  if (!imageCache.has(path)) {
    imageCache.set(path, new Promise((resolve) => {
      const img = new Image();
      const external = /^https?:/.test(path);
      if (external) img.crossOrigin = "anonymous"; // 외부 이미지도 PDF에 그릴 수 있도록
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = external ? path : fileUrl(path);
    }));
  }
  return imageCache.get(path);
}

// 대표 이미지가 없는 영상 작업: 유튜브 썸네일 (고화질 없으면 120px 회색 이미지가 오므로 hq로)
async function loadCover(w) {
  if (w.cover || !w.videos?.length) return loadImage(w.cover);
  const id = w.videos[0].id;
  const max = await loadImage(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);
  return max && max.naturalWidth > 120 ? max : loadImage(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
}

function font(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

// 공백 단위로 줄바꿈하되, 한 단어가 너무 길면 글자 단위로 자른다
function wrapText(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/(?<=\s)/)) {
      if (ctx.measureText(line + word).width <= maxW) { line += word; continue; }
      if (line.trim()) { lines.push(line.trimEnd()); line = ""; }
      for (const ch of word.trimStart()) {
        if (line && ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
        else line += ch;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// 주어진 높이 안에 들어가는 만큼만 그리고, 넘치면 마지막 줄에 …
function drawTextBlock(ctx, text, x, y, maxW, lineH, maxY) {
  const lines = wrapText(ctx, text, maxW);
  const fit = Math.max(0, Math.floor((maxY - y) / lineH));
  lines.slice(0, fit).forEach((line, i) => {
    let s = line;
    if (i === fit - 1 && lines.length > fit) {
      while (s && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
      s += "…";
    }
    ctx.fillText(s, x, y + i * lineH);
  });
  return y + Math.min(lines.length, fit) * lineH;
}

function drawImageFit(ctx, img, x, y, w, h, mode = "contain") {
  ctx.fillStyle = COLOR.imgBg;
  ctx.fillRect(x, y, w, h);
  if (!img) return;
  const iw = img.naturalWidth || 4, ih = img.naturalHeight || 3;
  const scale = mode === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function drawChips(ctx, tags, x, y, maxW, tagColor) {
  font(ctx, 22, 700);
  const padX = 16, h = 40, gap = 10;
  let cx = x, cy = y;
  for (const t of tags) {
    const w = ctx.measureText(t).width + padX * 2;
    if (cx > x && cx + w > x + maxW) { cx = x; cy += h + gap; }
    ctx.fillStyle = tagColor?.(t) || COLOR.chip;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(cx, cy, w, h, h / 2) : ctx.rect(cx, cy, w, h);
    ctx.fill();
    ctx.fillStyle = COLOR.fg;
    ctx.textBaseline = "middle";
    ctx.fillText(t, cx + padX, cy + h / 2 + 1);
    ctx.textBaseline = "alphabetic";
    cx += w + gap;
  }
  return cy + h;
}

function drawFooter(ctx, pageNo, total) {
  font(ctx, 20);
  ctx.fillStyle = COLOR.muted;
  ctx.textAlign = "left";
  ctx.fillText(`${PDF_SITE_NAME} — Portfolio`, PAGE.m, PAGE.h - 50);
  ctx.textAlign = "right";
  ctx.fillText(`${pageNo} / ${total}`, PAGE.w - PAGE.m, PAGE.h - 50);
  ctx.textAlign = "left";
}

function clear(ctx) {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, PAGE.w, PAGE.h);
}

async function drawCoverPage(ctx, works, opts, total) {
  clear(ctx);
  const { m } = PAGE;
  const logoH = 220;
  const logo = await loadImage(PDF_LOGO);
  if (logo) ctx.drawImage(logo, m, m, logoH * LOGO_RATIO, logoH);

  ctx.fillStyle = COLOR.fg;
  ctx.textAlign = "right";
  font(ctx, 28, 700);
  ctx.fillText("Portfolio", PAGE.w - m, m + 28);
  font(ctx, 24);
  ctx.fillStyle = COLOR.muted;
  ctx.fillText(new Date().toLocaleDateString("ko-KR"), PAGE.w - m, m + 66);
  ctx.textAlign = "left";

  const infoY = m + logoH + 90;
  font(ctx, 26, 700);
  ctx.fillStyle = COLOR.fg;
  ctx.fillText(`${works.length}개 프로젝트`, m, infoY);
  if (opts.selectedTags.length) {
    drawChips(ctx, opts.selectedTags, m + ctx.measureText(`${works.length}개 프로젝트`).width + 30, infoY - 29, PAGE.w - m * 2 - 300, opts.tagColor);
  }

  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(m, infoY + 50);
  ctx.lineTo(PAGE.w - m, infoY + 50);
  ctx.stroke();

  // 목차: 2단, 넘치면 생략
  const top = infoY + 110, lineH = 46, colW = (PAGE.w - m * 2 - 60) / 2;
  const perCol = Math.floor((PAGE.h - 120 - top) / lineH);
  font(ctx, 24);
  works.slice(0, perCol * 2).forEach((w, i) => {
    const col = Math.floor(i / perCol), row = i % perCol;
    const x = m + col * (colW + 60), y = top + row * lineH;
    ctx.fillStyle = COLOR.muted;
    ctx.fillText(String(i + 2).padStart(2, "0"), x, y);
    ctx.fillStyle = COLOR.fg;
    let title = w.title;
    while (ctx.measureText(title).width > colW - 180 && title.length > 1) title = title.slice(0, -1);
    ctx.fillText(title === w.title ? title : title + "…", x + 60, y);
    ctx.fillStyle = COLOR.muted;
    ctx.textAlign = "right";
    ctx.fillText(w.year || "", x + colW, y);
    ctx.textAlign = "left";
  });
  if (works.length > perCol * 2) {
    ctx.fillStyle = COLOR.muted;
    ctx.fillText(`외 ${works.length - perCol * 2}개`, m, top + perCol * lineH);
  }
  drawFooter(ctx, 1, total);
}

async function drawWorkPage(ctx, w, pageNo, total, tagColor) {
  clear(ctx);
  const { m } = PAGE;
  const imgW = 1000, imgH = PAGE.h - m * 2 - 60;
  const colX = m + imgW + 60, colW = PAGE.w - m - colX;
  const bottom = m + imgH;

  drawImageFit(ctx, await loadCover(w), m, m, imgW, imgH);

  // 오른쪽 아래: 추가 이미지 최대 3장
  const extras = w.images.slice(1, 4);
  const thumbH = 150, gap = 12;
  const textBottom = extras.length ? bottom - thumbH - 30 : bottom;
  if (extras.length) {
    const tw = (colW - gap * 2) / 3;
    const imgs = await Promise.all(extras.map(loadImage));
    imgs.forEach((img, i) => drawImageFit(ctx, img, colX + i * (tw + gap), bottom - thumbH, tw, thumbH, "cover"));
  }

  let y = m;
  font(ctx, 22);
  ctx.fillStyle = COLOR.muted;
  ctx.fillText(String(pageNo).padStart(2, "0"), colX, y + 22);
  y += 70;

  font(ctx, 48, 700);
  ctx.fillStyle = COLOR.fg;
  y = drawTextBlock(ctx, w.title, colX, y + 48, colW, 64, y + 48 + 64 * 3) - 64 + 30;

  const meta = [w.year, w.client].filter(Boolean).join("  ·  ");
  if (meta) {
    font(ctx, 24);
    ctx.fillStyle = COLOR.muted;
    y = drawTextBlock(ctx, meta, colX, y + 30, colW, 36, y + 30 + 36 * 2) + 10;
  }

  y = drawChips(ctx, w.tags, colX, y + 10, colW, tagColor) + 40;

  // 유튜브 링크: PDF에서 클릭하면 영상으로 이동
  const links = [];
  if (w.videos?.length) {
    font(ctx, 22, 700);
    ctx.fillStyle = COLOR.fg;
    for (const v of w.videos) {
      const label = `▶  영상 보기   youtu.be/${v.id}`;
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, colX, y + 22);
      ctx.fillRect(colX, y + 30, tw, 1.5);
      links.push({ x: colX, y: y - 4, w: tw, h: 40, url: `https://youtu.be/${v.id}` });
      y += 46;
    }
    y += 20;
  }

  if (w.description) {
    font(ctx, 24);
    ctx.fillStyle = COLOR.fg;
    drawTextBlock(ctx, w.description, colX, y + 24, colW, 40, textBottom);
  }
  drawFooter(ctx, pageNo, total);
  return links;
}

async function exportPortfolioPdf(works, opts) {
  if (!works.length) return;
  if (!window.jspdf) throw new Error("PDF 라이브러리(jsPDF)를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
  // 웹폰트는 쓰는 글자만 나눠 받으므로, PDF에 들어갈 글자를 미리 불러온다
  const text = ["Portfolio 0123456789 개 프로젝트 외 —·…/", PDF_SITE_NAME, ...opts.selectedTags,
    ...works.flatMap((w) => [w.title, w.year, w.client, w.description, ...w.tags])].join(" ");
  await Promise.all([400, 700].map((wt) => document.fonts.load(`${wt} 24px ${FONT}`, text)));

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const canvas = document.createElement("canvas");
  canvas.width = PAGE.w;
  canvas.height = PAGE.h;
  const ctx = canvas.getContext("2d");
  const total = works.length + 1;
  const addPage = (first) => {
    if (!first) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, 297, 210);
  };

  await drawCoverPage(ctx, works, opts, total);
  addPage(true);
  for (let i = 0; i < works.length; i++) {
    opts.onProgress?.(i + 1, works.length);
    const links = await drawWorkPage(ctx, works[i], i + 2, total, opts.tagColor);
    addPage(false);
    const k = 297 / PAGE.w; // 캔버스 px → mm
    for (const l of links) pdf.link(l.x * k, l.y * k, l.w * k, l.h * k, { url: l.url });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const tagPart = opts.selectedTags.length ? opts.selectedTags.join("_") : "전체";
  pdf.save(`${PDF_SITE_NAME}_portfolio_${tagPart}_${stamp}.pdf`.replace(/[\\/:*?"<>|\s]+/g, "-"));
}
