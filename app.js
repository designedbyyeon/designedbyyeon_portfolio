// 포트폴리오: 문장형 태그 필터 + 작업 목록 + 상세 보기 + PDF 내보내기
//
// 소개 문장 속 단어가 곧 태그 버튼이다.
//   "그래픽 디자이너 김도연입니다. [작업 종류…] 작업으로 [장르…] 등을 만듭니다. [PDF]"
// 태그를 고르면 고른 태그와 이어지는 말만 또렷해져 한 문장으로 읽힌다.
//   예) 한글레터링 + 프로모션 → "한글레터링 작업으로 프로모션을 만듭니다."
//
// 필터 규칙: 같은 그룹(줄) 안에서는 OR, 다른 그룹끼리는 AND.
const state = {
  data: { tagGroups: [], works: [] },
  selected: new Set(),
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 한글/공백이 들어간 폴더·파일 이름을 URL로 안전하게
const fileUrl = (p) => p.split("/").map(encodeURIComponent).join("/");

// ---------- 태그 ----------
let tagInfo = new Map(); // 태그 → { group, color }
let kindTags = [];       // 첫 번째 그룹 (색 태그, 작업 종류)
let genreTags = [];      // 나머지 그룹 (회색 태그, 장르)
function indexTags() {
  tagInfo = new Map();
  state.data.tagGroups.forEach((g, gi) => g.tags.forEach((t) => tagInfo.set(t.name, { group: gi, color: t.color })));
  kindTags = state.data.tagGroups[0]?.tags.map((t) => t.name) || [];
  genreTags = state.data.tagGroups.slice(1).flatMap((g) => g.tags.map((t) => t.name));
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

// 받침 여부로 을/를 고르기 (영문·숫자는 읽는 소리 기준: 엘·엠·엔·알 / 영·일·삼·육·칠·팔 → 받침 있음)
function objectJosa(word) {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  let batchim = false;
  if (code >= 0 && code <= 11171) batchim = code % 28 !== 0;
  else if (/[a-z]/i.test(ch)) batchim = "lmnr".includes(ch.toLowerCase());
  else if (/\d/.test(ch)) batchim = "013678".includes(ch);
  return batchim ? "을" : "를";
}

function chipHtml(tag, { count = true } = {}) {
  const color = tagColor(tag);
  return `<button type="button" class="chip${color ? " colored" : ""}"${color ? ` style="--c:${esc(color)}"` : ""} data-tag="${esc(tag)}">${esc(tag)}${count ? "<sup></sup>" : ""}</button>`;
}

// 태그 사이 쉼표도 따로 두어, 선택된 태그끼리만 이어지게
// 태그와 뒤따르는 쉼표는 한 덩어리(.tk)로 묶어 쉼표가 줄 맨 앞으로 떨어지지 않게
// 줄바꿈은 덩어리 사이(<wbr>)에서만 일어남
const chipGroup = (tags) => tags.map((t, i) => i < tags.length - 1
  ? `<span class="tk">${chipHtml(t)}<span class="w sep">, </span></span>`
  : chipHtml(t)).join("<wbr>");

function buildSentence() {
  // PDF 버튼이 문장 안에 붙어 있으면 문장을 다시 만들 때 함께 지워지므로 먼저 밖으로 빼 둔다
  $("#actions").before($("#pdf-btn"));
  $("#sentence").innerHTML = `
    <span class="w lead">그래픽 디자이너 김도연입니다.</span><br>
    <span id="kind-line">${chipGroup(kindTags)}<span class="w" id="end1"></span></span><br>
    <span id="genre-line">${chipGroup(genreTags)}<span class="w" id="end2"></span></span>`;
  $("#mini").innerHTML = [...kindTags, ...genreTags].map((t) => chipHtml(t, { count: false })).join("") + `<p class="count" id="mini-count"></p>`;
}

// 한 줄 조립: 태그 순서는 그대로, 끝말("작업으로" / "을 만듭니다.")은 항상 줄 맨 끝
function composeLine(line, endEl, text, attach = false) {
  // 지난번에 묶어둔 [마지막 태그 + 끝말]을 풀고 다시 조립
  line.querySelectorAll(".bind").forEach((b) => b.replaceWith(...b.childNodes));
  [...line.childNodes].forEach((n) => { if (n.nodeType === 3 && !n.textContent.trim()) n.remove(); });
  line.append(endEl);
  const chips = [...line.querySelectorAll(".chip")];
  if (!chips.length) return;
  const picked = chips.filter((c) => state.selected.has(c.dataset.tag));
  // 쉼표는 선택된 태그 뒤이면서 뒤에 선택된 태그가 더 있을 때만 문장에 포함
  chips.forEach((c) => {
    const sep = c.nextElementSibling?.classList.contains("sep") ? c.nextElementSibling : null;
    const i = picked.indexOf(c);
    sep?.classList.toggle("live", i >= 0 && i < picked.length - 1);
  });
  endEl.textContent = text;
  endEl.classList.toggle("live", picked.length > 0);
  // 줄의 마지막 태그와 끝말을 한 덩어리로 묶어 줄바꿈 때 갈라지지 않게
  const last = chips.at(-1);
  const bind = document.createElement("span");
  bind.className = "bind";
  last.before(bind);
  // 조사(을/를)는 바로 붙이고, 그 외("작업으로", "등을 만듭니다.")는 한 칸 띄움
  bind.append(last, attach && picked.length ? "" : " ", endEl);
}

function updateSentence() {
  const on = state.selected.size > 0;
  const k = kindTags.filter((t) => state.selected.has(t));
  const g = genreTags.filter((t) => state.selected.has(t));
  const sentence = $("#sentence");
  sentence.classList.toggle("has-sel", on);
  $("#mini").classList.toggle("has-sel", on);

  document.querySelectorAll(".chip[data-tag]").forEach((b) => {
    const tag = b.dataset.tag;
    const sel = state.selected.has(tag);
    const n = sel ? null : countIfOn(tag);
    b.classList.toggle("on", sel);
    b.setAttribute("aria-pressed", sel);
    b.disabled = n === 0;
    b.title = sel ? "선택 해제" : `${n}개 작업`;
    const sup = b.querySelector("sup");
    if (sup) sup.textContent = sel ? "✕" : n;
  });

  const end1 = $("#end1"), end2 = $("#end2");
  composeLine($("#kind-line"), end1, k.length && !g.length ? "작업을 합니다." : "작업으로");
  composeLine($("#genre-line"), end2, g.length ? `${objectJosa(g.at(-1))} 만듭니다.` : "등을 만듭니다.", true);
  sentence.querySelector(".lead").classList.toggle("live", on);

  // PDF 버튼은 선택과 상관없이 항상 문장 맨 끝 ("…등을 만듭니다." 뒤)
  (end2.closest(".bind") || end2).after($("#pdf-btn"));
}

function updateCount(n) {
  const total = state.data.works.length;
  const clear = state.selected.size ? '<button type="button" data-clear>모두 보기</button>' : "";
  $("#count").innerHTML = `<b>${n}</b> / ${total}개 작업${clear}`;
  $("#mini-count").innerHTML = `${n} / ${total}${clear}`;
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

// 이미지가 받아지면 나타나게 (받는 중에 반쯤 그려진 이미지가 보이지 않도록)
function fadeInImages(root) {
  root.querySelectorAll("img").forEach((img) => {
    const done = () => img.classList.add("loaded");
    img.complete && img.naturalWidth ? done() : img.addEventListener("load", done, { once: true });
  });
}

const tileEls = new Map(); // 작업 id → 타일 요소 (필터가 바뀌어도 다시 만들지 않고 재사용)

function createTile(w) {
  const el = document.createElement("article");
  el.className = "tile";
  el.dataset.id = w.id;
  el.dataset.open = w.id;
  el.innerHTML = `
    <button type="button" class="tile-btn" aria-label="${esc(w.title)} 자세히 보기">
      ${coverHtml(w)}
      ${w.videos?.length ? `<span class="video-badge" title="영상 포함">▶</span>` : ""}
    </button>
    <div class="tile-head">
      <span class="tile-title">${esc(w.title)}</span>
      ${w.year ? `<span class="tile-year">${esc(w.year)}</span>` : ""}
    </div>
    <div class="tile-tags">${w.tags.map((t) => tagColor(t)
      ? `<i title="${esc(t)}" style="--c:${esc(tagColor(t))}"></i>`
      : `<span data-tag-label="${esc(t)}">${esc(t)}</span>`).join("")}</div>`;
  fadeInImages(el);
  return el;
}

function renderGrid(visible, { animated = true } = {}) {
  const grid = $("#work");
  const ids = new Set(visible.map((w) => w.id));
  grid.querySelectorAll(".tile").forEach((el) => { if (!ids.has(el.dataset.id)) el.remove(); });
  for (const w of visible) {
    if (!tileEls.has(w.id)) tileEls.set(w.id, createTile(w));
    const el = tileEls.get(w.id);
    // 새로 들어오는 작업만 짧게 나타나게
    if (animated && !el.isConnected) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); }
    grid.appendChild(el); // 순서 맞추기 (이미 있으면 이동)
    // 선택한 장르는 작업 아래 태그에서도 진하게
    el.querySelectorAll("[data-tag-label]").forEach((s) => s.classList.toggle("hit", state.selected.has(s.dataset.tagLabel)));
  }
  grid.querySelector(".empty")?.remove();
  if (!visible.length) grid.insertAdjacentHTML("beforeend", `<p class="empty">조건에 맞는 작업이 없습니다.</p>`);
}

// 태그에 마우스를 올리면: 해당 없는 작업을 흐리게 (누르기 전 미리보기)
function peek(tag) {
  const grid = $("#work");
  grid.classList.toggle("peeking", !!tag);
  grid.querySelectorAll(".tile").forEach((el) => {
    const w = state.data.works.find((x) => x.id === el.dataset.id);
    el.classList.toggle("peek", !!tag && w.tags.includes(tag));
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
  updateSentence();
  updateCount(visible.length);
  renderGrid(visible, opts);
  $("#pdf-btn").disabled = !visible.length;
}

// 목록을 한참 내려본 상태에서 필터를 바꾸면 목록 맨 위로
function scrollToGridIfNeeded() {
  const top = $("#work").getBoundingClientRect().top + scrollY - 70;
  if (scrollY > top) scrollTo({ top });
}

function toggleTag(tag) {
  state.selected.has(tag) ? state.selected.delete(tag) : state.selected.add(tag);
  peek(null);
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
        <button type="button" class="close-btn" data-close>닫기 ✕</button>
      </div>
      <div class="detail-tags">${w.tags.map((t) => `<span class="chip${tagColor(t) ? " colored" : ""}"${tagColor(t) ? ` style="--c:${esc(tagColor(t))}"` : ""}>${esc(t)}</span>`).join("")}</div>
      ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      ${w.description ? `<p class="detail-desc">${esc(w.description)}</p>` : ""}
      ${w.videos?.length ? `<div class="detail-videos">${w.videos.map(videoHtml).join("")}</div>` : ""}
      <div class="detail-images">${w.images.map((src) => `<img src="${fileUrl(src)}" alt="" loading="lazy">`).join("")}</div>
    </div>`;
  fadeInImages(dlg);
  document.documentElement.classList.add("modal-open");
  dlg.showModal();
  dlg.scrollTop = 0;
}

dlg.addEventListener("close", () => {
  dlg.innerHTML = ""; // 재생 중인 영상도 멈추게
  document.documentElement.classList.remove("modal-open");
});

// ---------- 이벤트 ----------
document.addEventListener("click", (e) => {
  const tag = e.target.closest("button[data-tag]");
  if (tag) return toggleTag(tag.dataset.tag);
  if (e.target.closest("[data-clear]")) {
    state.selected.clear();
    render();
    return scrollToGridIfNeeded();
  }
  if (e.target.closest("[data-close]") || e.target === dlg) return dlg.close();
  const open = e.target.closest("[data-open]");
  if (open) return openDetail(open.dataset.open);
});
document.addEventListener("mouseover", (e) => {
  const b = e.target.closest("button[data-tag]");
  peek(b && !b.disabled ? b.dataset.tag : null);
});
window.addEventListener("hashchange", () => { readHash(); render(); });

// 문장이 화면에서 벗어나면 위에 작은 태그 줄 표시
new IntersectionObserver(([e]) => $("#mini").classList.toggle("show", !e.isIntersecting && e.boundingClientRect.top < 0))
  .observe($("#actions"));

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
        label.textContent = `만드는 중 ${i}/${n}`;
        btn.style.setProperty("--p", `${(i / n) * 100}%`);
      },
    });
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

// ---------- 데이터 ----------
async function loadData() {
  const res = await fetch("works.json", { cache: "no-store" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function setData(data) {
  state.data = data;
  indexTags();
  buildSentence();
  // 데이터가 바뀌면 타일을 새로 만든다 (내용이 바뀌었을 수 있으므로)
  tileEls.clear();
  $("#work").innerHTML = "";
  render({ animated: false });
}

(async () => {
  readHash();
  try {
    setData(await loadData());
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
