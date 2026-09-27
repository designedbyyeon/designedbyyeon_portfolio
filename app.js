// 포트폴리오 프로토타입: 태그 필터 + 상세 보기 + PDF 내보내기
const state = {
  data: { tagGroups: [], works: [] },
  selected: new Set(),
  mode: "and",
  excluded: new Set(), // PDF에서 제외한 작업 id
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 한글/공백이 들어간 폴더·파일 이름을 URL로 안전하게
const fileUrl = (p) => p.split("/").map(encodeURIComponent).join("/");

// ---------- 필터 ----------
function matches(work, selected = state.selected) {
  if (!selected.size) return true;
  const has = (t) => work.tags.includes(t);
  return state.mode === "and" ? [...selected].every(has) : [...selected].some(has);
}
const visibleWorks = () => state.data.works.filter((w) => matches(w));
const pdfWorks = () => visibleWorks().filter((w) => !state.excluded.has(w.id));

function toggleTag(tag) {
  state.selected.has(tag) ? state.selected.delete(tag) : state.selected.add(tag);
  render();
}

// 선택 상태를 주소(#tags=...)에 저장 → 필터된 링크를 그대로 공유 가능
function writeHash() {
  const p = new URLSearchParams();
  if (state.selected.size) p.set("tags", [...state.selected].join(","));
  if (state.mode !== "and") p.set("mode", state.mode);
  const h = p.toString();
  history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.selected = new Set((p.get("tags") || "").split(",").filter(Boolean));
  state.mode = p.get("mode") === "or" ? "or" : "and";
}

// ---------- 렌더링 ----------
function render() {
  const allTags = new Set(state.data.works.flatMap((w) => w.tags));
  for (const t of state.selected) if (!allTags.has(t)) state.selected.delete(t);
  writeHash();

  const visible = visibleWorks();
  document.querySelectorAll(".mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === state.mode));

  // 태그 칩 옆 숫자: AND면 "지금 결과 중 이 태그를 가진 수", OR면 전체 수
  const countFor = (tag) => {
    const pool = state.mode === "and" ? visible : state.data.works;
    return pool.filter((w) => w.tags.includes(tag)).length;
  };
  $("#tag-groups").innerHTML = state.data.tagGroups.map((g) => `
    <div class="group">
      <span class="group-name">${esc(g.name)}</span>
      <div class="chips">${g.tags.map((t) => {
        const on = state.selected.has(t);
        const n = countFor(t);
        return `<button type="button" class="tag${on ? " on" : ""}" data-tag="${esc(t)}" aria-pressed="${on}" ${!on && !n ? "disabled" : ""}>${esc(t)}<span class="n">${n}</span></button>`;
      }).join("")}</div>
    </div>`).join("");

  $("#grid").innerHTML = visible.length ? visible.map((w) => {
    const meta = [w.year, w.client].filter(Boolean).join(" · ");
    const inc = !state.excluded.has(w.id);
    return `
    <article class="card${inc ? "" : " excluded"}">
      <button type="button" class="thumb" data-open="${esc(w.id)}" aria-label="${esc(w.title)} 자세히 보기">
        ${w.cover ? `<img src="${fileUrl(w.cover)}" alt="" loading="lazy">` : ""}
      </button>
      <div class="card-body">
        <h3>${esc(w.title)}</h3>
        ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
        <div class="chips">${w.tags.map((t) => `<button type="button" class="tag${state.selected.has(t) ? " on" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>
        <label class="include"><input type="checkbox" data-include="${esc(w.id)}" ${inc ? "checked" : ""}> PDF에 포함</label>
      </div>
    </article>`;
  }).join("") : `<p class="empty">조건에 맞는 작업이 없습니다.</p>`;

  const nPdf = pdfWorks().length;
  $("#summary").textContent = `작업 ${visible.length}개 / 전체 ${state.data.works.length}개 · PDF 포함 ${nPdf}개`;
  $("#pdf-btn").disabled = !nPdf;
}

function openDetail(id) {
  const w = state.data.works.find((x) => x.id === id);
  if (!w) return;
  const rows = [["연도", w.year], ["클라이언트", w.client], ["역할", w.role], ...Object.entries(w.extra || {})].filter(([, v]) => v);
  const dlg = $("#detail");
  dlg.innerHTML = `
    <div class="detail">
      <div class="detail-head">
        <div>
          <h2>${esc(w.title)}</h2>
          <div class="chips">${w.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        </div>
        <button type="button" class="close" data-close>닫기</button>
      </div>
      ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      ${w.description ? `<p class="desc">${esc(w.description)}</p>` : ""}
      <div class="images">${w.images.map((src) => `<img src="${fileUrl(src)}" alt="" loading="lazy">`).join("")}</div>
    </div>`;
  dlg.showModal();
  dlg.scrollTop = 0;
}

// ---------- 이벤트 ----------
document.addEventListener("click", (e) => {
  const tag = e.target.closest("button[data-tag]");
  if (tag) return toggleTag(tag.dataset.tag);
  const open = e.target.closest("[data-open]");
  if (open) return openDetail(open.dataset.open);
  const mode = e.target.closest(".mode button");
  if (mode) { state.mode = mode.dataset.mode; return render(); }
  if (e.target.closest("[data-close]") || e.target === $("#detail")) return $("#detail").close();
});
document.addEventListener("change", (e) => {
  const id = e.target.dataset?.include;
  if (id === undefined) return;
  e.target.checked ? state.excluded.delete(id) : state.excluded.add(id);
  render();
});
$("#clear").addEventListener("click", () => { state.selected.clear(); render(); });
$("#include-all").addEventListener("click", () => { state.excluded.clear(); render(); });
window.addEventListener("hashchange", () => { readHash(); render(); });

$("#pdf-btn").addEventListener("click", async () => {
  const btn = $("#pdf-btn");
  const label = btn.textContent;
  btn.disabled = true;
  try {
    await exportPortfolioPdf(pdfWorks(), {
      selectedTags: [...state.selected],
      mode: state.mode,
      onProgress: (i, n) => (btn.textContent = `PDF 만드는 중… ${i}/${n}`),
    });
  } catch (err) {
    console.error(err);
    alert("PDF 생성 중 오류가 발생했습니다.\n" + err.message);
  } finally {
    btn.textContent = label;
    render();
  }
});

// ---------- 데이터 ----------
async function loadData() {
  const res = await fetch("works.json", { cache: "no-store" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

(async () => {
  readHash();
  try {
    state.data = await loadData();
  } catch {
    $("#grid").innerHTML = `<p class="empty">works.json을 불러올 수 없습니다. <code>python serve.py</code>로 실행해 주세요.</p>`;
    return;
  }
  render();

  // 로컬 미리보기에서는 works 폴더가 바뀌면 자동으로 새 데이터 반영
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    setInterval(async () => {
      try {
        const next = await loadData();
        if (next.generatedAt !== state.data.generatedAt) {
          state.data = next;
          render();
        }
      } catch {}
    }, 2000);
  }
})();
