// 포트폴리오: 태그 필터 + 작업 목록 + 상세 보기 + PDF 내보내기 (+ 모션)
//
// 필터 규칙: 같은 그룹(한 줄) 안에서는 OR, 다른 그룹끼리는 AND.
//   한글레터링 + 모션&3D → 둘 중 하나 / 한글레터링 + 광고 → 둘 다
const state = {
  data: { tagGroups: [], works: [] },
  selected: new Set(),
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 한글/공백이 들어간 폴더·파일 이름을 URL로 안전하게
const fileUrl = (p) => p.split("/").map(encodeURIComponent).join("/");

// ---------- 모션 공통 ----------
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.2,.7,.2,1)";
const T0 = performance.now(); // 첫 등장 애니메이션 타임라인 기준

// fill: "backwards" → 딜레이 동안은 시작 상태, 끝나면 CSS 상태로 돌아감
function animate(el, keyframes, opts = {}) {
  if (reduceMotion || !el?.animate) return null;
  return el.animate(keyframes, { easing: EASE, fill: "backwards", ...opts });
}
// 페이지 로드 기준 at(ms) 시점에 등장
function introAt(el, at, extra = {}) {
  el.removeAttribute("data-intro");
  const delay = Math.max(0, at - (performance.now() - T0));
  animate(el, [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 800, delay, ...extra });
}

// ---------- 태그 ----------
let tagInfo = new Map(); // 태그 → { group, color }
function indexTags() {
  tagInfo = new Map();
  state.data.tagGroups.forEach((g, gi) => g.tags.forEach((t) => tagInfo.set(t.name, { group: gi, color: t.color })));
}
const tagColor = (tag) => tagInfo.get(tag)?.color || null;

function matches(work, selected = state.selected) {
  const byGroup = new Map();
  for (const t of selected) {
    const g = tagInfo.get(t)?.group ?? -1;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(t);
  }
  for (const tags of byGroup.values()) {
    if (!tags.some((t) => work.tags.includes(t))) return false;
  }
  return true;
}
const visibleWorks = () => state.data.works.filter((w) => matches(w));

// 이 태그를 켰을 때 남는 작업 수 (0이면 버튼 비활성)
function countIfOn(tag) {
  const sel = new Set(state.selected).add(tag);
  return state.data.works.filter((w) => matches(w, sel)).length;
}

// 태그 버튼은 한 번만 만들고 이후엔 상태(class)만 바꿔서 CSS 전환 효과가 살아 있게
function buildTags(firstLoad) {
  const rows = $("#tag-groups");
  rows.innerHTML = state.data.tagGroups.map((g) => `
    <div class="tag-row" role="group" aria-label="${esc(g.name)}">${g.tags.map((t, i) => `
      <button type="button" class="chip${t.color ? " colored" : ""}" style="--i:${i}${t.color ? `;--c:${esc(t.color)}` : ""}" data-tag="${esc(t.name)}">
        <span class="chip-label">${esc(t.name)}</span><span class="chip-x" aria-hidden="true">✕</span>
      </button>`).join("")}
    </div>`).join("");
  if (firstLoad) rows.querySelectorAll(".chip").forEach((c, i) => introAt(c, 650 + i * 45, { duration: 700 }));
}

function updateTags() {
  const rows = $("#tag-groups");
  rows.classList.toggle("has-selection", state.selected.size > 0);
  rows.querySelectorAll(".chip").forEach((b) => {
    const tag = b.dataset.tag;
    const on = state.selected.has(tag);
    const n = on ? null : countIfOn(tag);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    b.disabled = n === 0;
    b.title = on ? "선택 해제" : `${n}개 작업`;
  });
}

function popChip(btn) {
  animate(btn, [
    { transform: "scale(1)" }, { transform: "scale(.9)", offset: .3 },
    { transform: "scale(1.06)", offset: .65 }, { transform: "scale(1)" },
  ], { duration: 420, easing: "ease-out" });
}

// ---------- 상태 문구 (숫자 카운트) ----------
let shownCount = 0;
function updateStatus(n) {
  const st = $("#status");
  const on = state.selected.size > 0;
  if (on && !st.querySelector(".count")) {
    st.innerHTML = `<span class="count">${n}</span>개 작업 · <button type="button" id="clear">선택 해제</button>`;
    shownCount = n;
  }
  st.classList.toggle("show", on);
  if (!on) return;
  const el = st.querySelector(".count");
  const from = shownCount, to = n, start = performance.now();
  shownCount = n;
  if (reduceMotion || from === to) { el.textContent = to; return; }
  const step = (now) => {
    const k = Math.min(1, (now - start) / 400);
    el.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1 && shownCount === to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- 작업 타일 ----------
// 대표 이미지가 없고 유튜브 영상만 있으면 영상 썸네일을 대신 사용
function coverHtml(w) {
  if (w.cover) return `<img src="${fileUrl(w.cover)}" alt="" loading="lazy">`;
  const v = w.videos?.[0];
  if (!v) return "";
  // 고화질 썸네일이 없으면 유튜브가 120px짜리 회색 이미지를 주므로, 그땐 hqdefault로 교체
  const hq = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  const fallback = `if(this.src!=='${hq}'&&this.naturalWidth<=120)this.src='${hq}'`;
  return `<img src="https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg" alt="" loading="lazy" onload="${fallback}" onerror="this.onerror=null;this.src='${hq}'">`;
}

function videoHtml(v) {
  return `<div class="video${v.vertical ? " vertical" : ""}">
    <iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id)}?rel=0" title="YouTube 영상" loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
  </div>`;
}

function metaText(w) {
  return [w.year, w.client].filter(Boolean).join(" · ");
}

// 이미지가 다 받아지면 부드럽게 나타나게
function fadeInImages(root) {
  root.querySelectorAll("img").forEach((img) => {
    const done = () => img.classList.add("loaded");
    img.complete && img.naturalWidth ? done() : img.addEventListener("load", done, { once: true });
  });
}

// 스크롤해서 화면에 들어올 때 차례로 등장
const revealer = new IntersectionObserver((entries) => {
  let i = 0;
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const inner = e.target.querySelector(".tile-inner");
    inner.style.transitionDelay = `${i++ * 80}ms`;
    inner.classList.add("in");
    revealer.unobserve(e.target);
  }
}, { rootMargin: "0px 0px -6% 0px" });

const tileEls = new Map(); // 작업 id → 타일 요소 (필터 바뀔 때 재사용해서 위치 이동 애니메이션)

function createTile(w, { reveal }) {
  const el = document.createElement("article");
  el.className = "tile";
  el.dataset.id = w.id;
  el.dataset.open = w.id;
  el.innerHTML = `
    <div class="tile-inner${reveal && !reduceMotion ? "" : " in"}">
      <button type="button" class="tile-btn" aria-label="${esc(w.title)} 자세히 보기">
        ${coverHtml(w)}
        ${w.videos?.length ? `<span class="video-badge" title="영상 포함">▶</span>` : ""}
      </button>
      <div class="tile-info">
        <div class="tile-head">
          <strong class="tile-title">${esc(w.title)}</strong>
          ${w.year ? `<span class="tile-year">${esc(w.year)}</span>` : ""}
        </div>
        <p class="tile-desc">${w.client ? `<span class="tile-client">${esc(w.client)}</span>` : ""}${esc(w.description.replace(/\s+/g, " "))}</p>
      </div>
    </div>`;
  fadeInImages(el);
  return el;
}

function resetLeaving(el) {
  el._exit?.cancel();
  el._exit = null;
  el.classList.remove("leaving");
  el.removeAttribute("style");
}

// FLIP: 남는 타일은 새 자리로 미끄러지고, 빠지는 타일은 사라지고, 새 타일은 떠오름
function renderGrid(visible, { animated = true, reveal = false } = {}) {
  const grid = $("#work");
  const doAnim = animated && !reduceMotion;
  const gridRect = grid.getBoundingClientRect();
  const first = new Map();
  if (doAnim) grid.querySelectorAll(".tile:not(.leaving)").forEach((el) => first.set(el.dataset.id, el.getBoundingClientRect()));

  const ids = new Set(visible.map((w) => w.id));
  for (const el of [...grid.querySelectorAll(".tile:not(.leaving)")]) {
    if (ids.has(el.dataset.id)) continue;
    if (!doAnim) { el.remove(); continue; }
    const r = first.get(el.dataset.id);
    el.classList.add("leaving");
    Object.assign(el.style, { left: `${r.left - gridRect.left}px`, top: `${r.top - gridRect.top}px`, width: `${r.width}px` });
    // 사라지는 애니메이션은 요소에 참조를 남겨두고, 끝나면 반드시 취소해서
    // 나중에 같은 타일을 다시 붙였을 때 투명한 상태가 남지 않게 한다.
    // (DOM에서 떨어진 요소는 getAnimations()로 찾을 수 없음)
    const exit = el.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.94)" }], { duration: 280, easing: EASE, fill: "forwards" });
    el._exit = exit;
    exit.onfinish = () => {
      el.remove();
      resetLeaving(el);
    };
  }

  const entering = [];
  for (const w of visible) {
    let el = tileEls.get(w.id);
    if (!el) {
      el = createTile(w, { reveal });
      tileEls.set(w.id, el);
      if (reveal) revealer.observe(el);
    }
    if (el.classList.contains("leaving")) { // 사라지는 중에 다시 선택된 경우
      resetLeaving(el);
      entering.push(el);
    } else if (!el.isConnected) {
      entering.push(el);
    }
    grid.appendChild(el);
  }

  grid.querySelector(".empty")?.remove();
  if (!visible.length) grid.insertAdjacentHTML("beforeend", `<p class="empty">조건에 맞는 작업이 없습니다.</p>`);
  if (!doAnim) return;

  for (const el of grid.querySelectorAll(".tile:not(.leaving)")) {
    const f = first.get(el.dataset.id);
    if (!f || entering.includes(el)) continue;
    const l = el.getBoundingClientRect();
    const dx = f.left - l.left, dy = f.top - l.top;
    if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 560, easing: EASE });
  }
  entering.forEach((el, i) => {
    el.querySelector(".tile-inner").classList.add("in");
    el.animate([{ opacity: 0, transform: "translateY(18px) scale(.97)" }, { opacity: 1, transform: "none" }],
      { duration: 520, delay: 140 + Math.min(i, 12) * 50, easing: EASE, fill: "backwards" }); // 많아도 최대 0.8초
  });
}

// ---------- 렌더링 ----------
function writeHash() {
  const h = state.selected.size ? "#" + new URLSearchParams({ tags: [...state.selected].join(",") }) : "";
  history.replaceState(null, "", h || location.pathname + location.search);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.selected = new Set((p.get("tags") || "").split(",").filter(Boolean));
}

function render(opts) {
  for (const t of state.selected) if (!tagInfo.has(t)) state.selected.delete(t);
  writeHash();
  const visible = visibleWorks();
  updateTags();
  updateStatus(visible.length);
  renderGrid(visible, opts);
  $("#pdf-btn").disabled = !visible.length;
}

// 목록을 한참 내려본 상태에서 필터를 바꾸면 목록 맨 위로
function scrollToGridIfNeeded() {
  const grid = $("#work");
  const offset = $(".filters").offsetHeight + 16;
  const top = grid.getBoundingClientRect().top + scrollY - offset;
  if (scrollY > top) scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
}

function toggleTag(btn) {
  const tag = btn.dataset.tag;
  state.selected.has(tag) ? state.selected.delete(tag) : state.selected.add(tag);
  popChip(btn);
  render();
  scrollToGridIfNeeded();
}

// ---------- 상세 ----------
const dlg = $("#detail");

function openDetail(id) {
  const w = state.data.works.find((x) => x.id === id);
  if (!w) return;
  const rows = Object.entries(w.extra || {}).filter(([, v]) => v);
  dlg.innerHTML = `
    <div class="detail-inner">
      <div class="detail-head">
        <div>
          <h2>${esc(w.title)}</h2>
          ${metaText(w) ? `<p class="detail-meta">${esc(metaText(w))}</p>` : ""}
        </div>
        <button type="button" class="pill-btn" data-close>닫기 ✕</button>
      </div>
      <div class="tag-row">${w.tags.map((t) => `<span class="chip${tagColor(t) ? " colored" : ""}"${tagColor(t) ? ` style="--c:${esc(tagColor(t))}"` : ""}>${esc(t)}</span>`).join("")}</div>
      ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      ${w.description ? `<p class="detail-desc">${esc(w.description)}</p>` : ""}
      ${w.videos?.length ? `<div class="detail-videos">${w.videos.map(videoHtml).join("")}</div>` : ""}
      <div class="detail-images">${w.images.map((src) => `<img src="${fileUrl(src)}" alt="" loading="lazy">`).join("")}</div>
    </div>`;
  fadeInImages(dlg);
  document.documentElement.classList.add("modal-open");
  dlg.showModal();
  dlg.scrollTop = 0;
  animate(dlg, [{ opacity: 0, transform: "translateY(28px)" }, { opacity: 1, transform: "none" }], { duration: 480 });
  animate(dlg, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, pseudoElement: "::backdrop" });
  [...dlg.querySelector(".detail-inner").children].forEach((c, i) =>
    animate(c, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 560, delay: 80 + i * 60 }));
}

let closing = false;
function closeDetail() {
  if (!dlg.open || closing) return;
  const a = animate(dlg, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(16px)" }], { duration: 220, fill: "forwards", easing: "ease-in" });
  animate(dlg, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards", pseudoElement: "::backdrop" });
  const finish = () => {
    dlg.close();
    dlg.getAnimations({ subtree: false }).forEach((x) => x.cancel());
    closing = false;
  };
  if (!a) return finish();
  closing = true;
  a.onfinish = finish;
}
dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeDetail(); }); // Esc
dlg.addEventListener("close", () => {
  dlg.innerHTML = ""; // 재생 중인 영상도 멈추게
  document.documentElement.classList.remove("modal-open");
});

// ---------- 이벤트 ----------
document.addEventListener("click", (e) => {
  const tag = e.target.closest("button[data-tag]");
  if (tag) return toggleTag(tag);
  if (e.target.closest("#clear")) {
    state.selected.clear();
    render();
    return scrollToGridIfNeeded();
  }
  if (e.target.closest("[data-close]") || e.target === dlg) return closeDetail();
  const open = e.target.closest("[data-open]");
  if (open) return openDetail(open.dataset.open);
});
window.addEventListener("hashchange", () => { readHash(); render(); });

// 태그 영역이 화면 위에 붙으면 구분선 표시
new IntersectionObserver(([e]) => $(".filters").classList.toggle("stuck", !e.isIntersecting))
  .observe($("#filters-sentinel"));

$("#pdf-btn").addEventListener("click", async () => {
  const btn = $("#pdf-btn");
  const label = btn.querySelector(".btn-label");
  const text = label.textContent;
  btn.disabled = true;
  btn.classList.add("busy");
  try {
    await exportPortfolioPdf(visibleWorks(), {
      selectedTags: [...state.selected],
      tagColor,
      onProgress: (i, n) => {
        label.textContent = `만드는 중… ${i}/${n}`;
        btn.style.setProperty("--p", `${(i / n) * 100}%`);
      },
    });
    label.textContent = "완료 ✓";
    await new Promise((r) => setTimeout(r, 1400));
  } catch (err) {
    console.error(err);
    alert("PDF 생성 중 오류가 발생했습니다.\n" + err.message);
  } finally {
    label.textContent = text;
    btn.classList.remove("busy");
    btn.style.removeProperty("--p");
    btn.disabled = !visibleWorks().length;
  }
});

// ---------- 로고: 레터링을 선으로 그린 뒤 채우기 ----------
async function introLogo() {
  const holder = $(".logo");
  const img = holder.querySelector("img");
  try {
    const svgText = await (await fetch(img.getAttribute("src"))).text();
    holder.innerHTML = svgText.replace(/<\?xml[^>]*>/, "");
  } catch {
    img.style.opacity = 1;
    return;
  }
  const svg = holder.querySelector("svg");
  svg.classList.add("logo-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "디자인드바이연");
  if (reduceMotion) return;

  const unit = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width; // 화면 1px = viewBox 몇 단위
  const paths = [...svg.querySelectorAll("path")]
    .map((p) => ({ p, x: p.getBBox().x }))
    .sort((a, b) => a.x - b.x);
  paths.forEach(({ p }, i) => {
    const len = p.getTotalLength();
    const color = getComputedStyle(p).fill;
    Object.assign(p.style, { stroke: color, strokeWidth: unit * 1.1, strokeDasharray: len });
    p.animate([
      { strokeDashoffset: len, fillOpacity: 0 },
      { strokeDashoffset: 0, fillOpacity: 0, offset: .6 },
      { strokeDashoffset: 0, fillOpacity: 1 },
    ], { duration: 1500, delay: 100 + i * 75, easing: "cubic-bezier(.65,0,.25,1)", fill: "backwards" })
      .onfinish = () => { p.style.stroke = "none"; };
  });
}

// ---------- 데이터 ----------
async function loadData() {
  const res = await fetch("works.json", { cache: "no-store" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function setData(data, { firstLoad = false } = {}) {
  state.data = data;
  indexTags();
  buildTags(firstLoad);
  // 데이터가 바뀌면 타일을 새로 만든다 (내용이 바뀌었을 수 있으므로)
  tileEls.clear();
  $("#work").innerHTML = "";
  render({ animated: false, reveal: true });
}

(async () => {
  readHash();
  introLogo();
  introAt($(".nav"), 250);
  document.querySelectorAll(".intro .line").forEach((el, i) => introAt(el, 380 + i * 110));
  introAt($("#pdf-btn"), 800);
  // JS 애니메이션을 안 쓰는 환경에서는 숨김 해제
  if (reduceMotion) document.querySelectorAll("[data-intro]").forEach((el) => el.removeAttribute("data-intro"));

  try {
    const data = await loadData();
    // 타일은 로고·태그가 어느 정도 나온 뒤 등장
    const wait = reduceMotion ? 0 : Math.max(0, 850 - (performance.now() - T0));
    await new Promise((r) => setTimeout(r, wait));
    setData(data, { firstLoad: true });
  } catch {
    $("#work").innerHTML = `<p class="empty">works.json을 불러올 수 없습니다. <code>python serve.py</code>로 실행해 주세요.</p>`;
    return;
  }

  // 로컬 미리보기에서는 works 폴더가 바뀌면 자동으로 새 데이터 반영
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    setInterval(async () => {
      try {
        const next = await loadData();
        if (next.generatedAt !== state.data.generatedAt) setData(next);
      } catch {}
    }, 2000);
  }
})();
