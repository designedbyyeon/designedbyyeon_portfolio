// 목록(index.html)과 작업 페이지(work.html)가 함께 쓰는 것들:
// 데이터 불러오기, 태그 색, 조사, 이미지·영상 조각, 로고 [바이] 색, 연락처 창

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 한글/공백이 들어간 폴더·파일 이름을 URL로 안전하게
const fileUrl = (p) => p.split("/").map(encodeURIComponent).join("/");

// ---------- 데이터 ----------
async function loadData() {
  const res = await fetch("works.json", { cache: "no-store" });
  if (!res.ok) throw new Error(res.status);
  const d = await res.json();
  d.activities ||= [];
  d.activityGroups ||= [];
  setTagColors(d);
  return d;
}

const colorOf = new Map(); // 모든 태그의 색 (작업 종류·활동 태그만 색이 있음)
function setTagColors(data) {
  colorOf.clear();
  [...data.tagGroups, ...data.activityGroups].forEach((g) => g.tags.forEach((t) => colorOf.set(t.name, t.color)));
}
const tagColor = (tag) => colorOf.get(tag) || null;

// 작업 페이지 주소: 작업은 ?w=, 활동은 ?a=
const pageUrl = (item, type = "work") => `work.html?${type === "activity" ? "a" : "w"}=${encodeURIComponent(item.id)}`;

// ---------- 조사 ----------
// 받침 여부로 을/를 (영문·숫자는 읽는 소리 기준: 엘·엠·엔·알 / 영·일·삼·육·칠·팔 → 받침 있음)
function objectJosa(word) {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  let batchim = false;
  if (code >= 0 && code <= 11171) batchim = code % 28 !== 0;
  else if (/[a-z]/i.test(ch)) batchim = "lmnr".includes(ch.toLowerCase());
  else if (/\d/.test(ch)) batchim = "013678".includes(ch);
  return batchim ? "을" : "를";
}

// 받침에 따라 '로/으로' (받침 없음·ㄹ받침 → 로). 영문·숫자는 읽는 소리 기준
function towardJosa(word) {
  const ch = String(word).trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  let eu = false;
  if (code >= 0 && code <= 11171) { const jong = code % 28; eu = jong !== 0 && jong !== 8; }
  else if (/[a-z]/i.test(ch)) eu = "mn".includes(ch.toLowerCase());   // 엠·엔 → 으로, 엘·알 → 로
  else if (/\d/.test(ch)) eu = "036".includes(ch);                    // 영·삼·육 → 으로
  return eu ? "으로" : "로";
}

// ---------- 이미지·영상 조각 ----------
function ytThumbHtml(v) {
  // 고화질 썸네일이 없으면 유튜브가 120px짜리 회색 이미지를 주므로, 그땐 hqdefault로 교체
  const hq = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  const fallback = `if(this.src!=='${hq}'&&this.naturalWidth<=120)this.src='${hq}'`;
  return `<img src="https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg" alt="" loading="lazy" onload="${fallback}" onerror="this.onerror=null;this.src='${hq}'">`;
}

// 대표 이미지가 없고 유튜브 영상만 있으면 영상 썸네일을 대신 사용
function coverHtml(w) {
  if (w.cover) return `<img src="${fileUrl(w.cover)}" alt="" loading="lazy">`;
  const v = w.videos?.[0];
  return v ? ytThumbHtml(v) : "";
}

function videoHtml(v) {
  return `<div class="video${v.vertical ? " vertical" : ""}">
    <iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id)}?rel=0" title="YouTube 영상" loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
  </div>`;
}

// 직접 넣은 영상: 소리 없이 자동 반복 재생 (소리는 플레이어에서 켜기)
function clipHtml(c) {
  return `<video class="clip" src="${fileUrl(c.src)}"${c.poster ? ` poster="${fileUrl(c.poster)}"` : ""} controls autoplay muted loop playsinline preload="metadata"></video>`;
}

function metaText(w) {
  return [w.year, w.client].filter(Boolean).join(" · ");
}

function chipSpan(t) {
  const c = tagColor(t);
  return `<span class="chip${c ? " colored" : ""}"${c ? ` style="--c:${esc(c)}"` : ""}>${esc(t)}</span>`;
}

// 이미지가 받아지면 나타나게 (받는 중에 반쯤 그려진 이미지가 보이지 않도록)
function fadeInImages(root) {
  root.querySelectorAll("img").forEach((img) => {
    const done = () => img.classList.add("loaded");
    img.complete && img.naturalWidth ? done() : img.addEventListener("load", done, { once: true });
  });
}

// ---------- 로고: [바이] 색 ----------
async function inlineLogo() {
  const holder = $(".logo");
  const img = holder.querySelector("img");
  try {
    const svg = await (await fetch(img.getAttribute("src"))).text();
    holder.innerHTML = svg.replace(/<\?xml[^>]*>/, "");
  } catch {
    return; // 못 불러오면 원래 이미지 로고 그대로
  }
  const el = holder.querySelector("svg");
  el.classList.add("logo-svg");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "디자인드바이연");
}

function setLogoColor(color) {
  const logo = $(".logo");
  color ? logo.style.setProperty("--by", color) : logo.style.removeProperty("--by");
}

// ---------- 연락처 창 (contact.txt → 문장) ----------
let contactData = { contact: {}, tagGroups: [] };

function openContact() {
  const dlg = $("#contact");
  const c = contactData.contact || {};
  // 연락처 알약 색은 작업 종류 색을 차례로 빌려 씀
  const workKinds = contactData.tagGroups[0]?.tags.map((t) => t.color) || [];
  const color = (i) => workKinds[i] || "var(--gray)";
  const pill = (i, inner, href) => href
    ? `<a class="chip colored contact-chip" style="--c:${esc(color(i))}" href="${esc(href)}"${href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${esc(inner)}</a>`
    : `<button type="button" class="chip colored contact-chip" style="--c:${esc(color(i))}" data-copy="${esc(inner)}" title="누르면 아이디가 복사돼요">${esc(inner)}</button>`;

  const lines = ["안녕하세요 디자이너 김도연입니다."];
  if (c.email) lines.push(`프로젝트는 ${pill(0, c.email, `mailto:${c.email}`)}${towardJosa(c.email)} 내용을 정리해서 보내주시면 빠르게 확인 후 회신드리고 있습니다.`);
  const tel = c.phone && pill(1, c.phone, `tel:${c.phone.replace(/[^\d+]/g, "")}`);
  const kakao = c.kakao && `카카오톡 ${pill(2, c.kakao)}${towardJosa(c.kakao)}`;
  if (tel && kakao) lines.push(`급한 일은 ${tel}${towardJosa(c.phone)} 전화를 주시거나 ${kakao} 연락 부탁드립니다.`);
  else if (tel) lines.push(`급한 일은 ${tel}${towardJosa(c.phone)} 전화 부탁드립니다.`);
  else if (kakao) lines.push(`급한 일은 ${kakao} 연락 부탁드립니다.`);
  if (c.instagram) {
    const id = c.instagram.replace(/^@/, "");
    lines.push(`작업은 인스타그램 ${pill(3, "@" + id, `https://www.instagram.com/${id}/`)}에 가장 먼저 올라옵니다.`);
  }

  dlg.innerHTML = `
    <div class="contact-inner">
      <button type="button" class="close-btn" data-close>닫기 ✕</button>
      <p class="contact-text">${lines.join("<br>")}</p>
    </div>`;
  document.documentElement.classList.add("modal-open");
  dlg.showModal();
}

async function copyText(btn) {
  const text = btn.dataset.copy;
  try { await navigator.clipboard.writeText(text); } catch { return; }
  btn.textContent = "복사됨 ✓";
  setTimeout(() => (btn.textContent = text), 1400);
}

// 연락처 창 열기·닫기·복사 (두 페이지 공통)
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-contact]")) return openContact();
  const copy = e.target.closest("[data-copy]");
  if (copy) return copyText(copy);
  const closeBtn = e.target.closest("[data-close]");
  if (closeBtn) return closeBtn.closest("dialog").close();
  if (e.target.tagName === "DIALOG") e.target.close(); // 창 바깥(어두운 부분) 클릭
});
document.addEventListener("close", () => document.documentElement.classList.remove("modal-open"), true);

// ---------- 목록 ↔ 작업 페이지 사이 기억 ----------
// 목록에서 작업을 누를 때 "지금 보이는 순서"와 "돌아갈 주소"를 저장 → 작업 페이지의 이전/다음·목록으로
const NAV_KEY = "dby-nav";
function saveNav(nav) {
  try { sessionStorage.setItem(NAV_KEY, JSON.stringify(nav)); } catch {}
}
function readNav() {
  try { return JSON.parse(sessionStorage.getItem(NAV_KEY)) || null; } catch { return null; }
}

// 접속할 때마다 작업 순서를 섞되, 같은 방문(탭) 안에서는 순서 유지 (작업 페이지 갔다 와도 그대로)
function sessionSeed() {
  try {
    let s = sessionStorage.getItem("dby-seed");
    if (!s) sessionStorage.setItem("dby-seed", (s = String(Math.floor(Math.random() * 2 ** 31))));
    return +s;
  } catch {
    return Math.floor(Math.random() * 2 ** 31);
  }
}
function shuffled(list, seed) {
  // 시드 고정 난수(mulberry32) + 피셔-예이츠 섞기
  let a = seed >>> 0;
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
