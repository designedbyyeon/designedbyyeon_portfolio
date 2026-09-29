// 작업(또는 활동) 하나의 페이지: work.html?w=작업폴더이름 / work.html?a=활동폴더이름
// - 주소가 있으니 링크로 공유할 수 있고, 폰의 뒤로가기도 자연스럽게 목록으로 돌아감
// - 목록에서 들어왔으면 그때 보이던 순서대로 이전/다음 (← → 키도)
// - 로고 [바이]는 이 작업의 작업 종류 색으로

const params = new URLSearchParams(location.search);
const type = params.has("a") ? "activity" : "work";
const id = params.get(type === "activity" ? "a" : "w");

function render(data) {
  const list = type === "activity" ? data.activities : data.works;
  const item = list.find((x) => x.id === id);
  const page = $("#page");
  document.querySelector(`[data-nav="${type}"]`)?.classList.add("on");

  if (!item) {
    page.innerHTML = `<p class="empty">작업을 찾을 수 없습니다. <a href="./">목록으로</a></p>`;
    return;
  }
  document.title = `${item.title} — 디자인드바이연`;
  setLogoColor(item.tags.map(tagColor).find(Boolean));

  // 이전/다음: 목록에서 들어왔고 같은 종류면 그 순서, 아니면 전체 순서
  const nav = readNav();
  const fromList = nav && nav.type === type && nav.ids?.includes(id);
  const ids = fromList ? nav.ids : list.map((x) => x.id);
  const i = ids.indexOf(id);
  const byId = (x) => list.find((w) => w.id === x);
  const prev = i > 0 ? byId(ids[i - 1]) : null;
  const next = i < ids.length - 1 ? byId(ids[i + 1]) : null;
  const back = fromList ? nav.back : (type === "activity" ? "./#view=activity" : "./");
  const rows = Object.entries(item.extra || {}).filter(([, v]) => v);

  const sibling = (w, dir) => w ? `
    <a class="sib sib-${dir}" href="${pageUrl(w, type)}">
      <span class="sib-thumb">${coverHtml(w)}</span>
      <span class="sib-text"><span class="sib-label">${dir === "prev" ? "← 이전" : "다음 →"}</span><span class="sib-title">${esc(w.title)}</span></span>
    </a>` : `<span class="sib sib-${dir} sib-empty"></span>`;

  page.innerHTML = `
    <div class="work-top">
      <a class="back-link" href="${esc(back)}">← 목록으로${fromList && nav.label ? ` <span>${esc(nav.label)}</span>` : ""}</a>
      <span class="work-pos">${i + 1} / ${ids.length}</span>
    </div>

    <article class="work-article">
      <h1 class="work-title">${esc(item.title)}</h1>
      ${metaText(item) ? `<p class="work-meta">${esc(metaText(item))}</p>` : ""}
      <div class="work-tags">${item.tags.map((t) => `<a class="chip${tagColor(t) ? " colored" : ""}"${tagColor(t) ? ` style="--c:${esc(tagColor(t))}"` : ""} href="./#${type === "activity" ? "view=activity&" : ""}tags=${encodeURIComponent(t)}" title="'${esc(t)}' 작업 모두 보기">${esc(t)}</a>`).join("")}</div>
      ${rows.length ? `<dl class="work-extra">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      ${item.description ? `<p class="work-desc">${esc(item.description)}</p>` : ""}

      <div class="work-media">
        ${(item.clips || []).map(clipHtml).join("")}
        ${item.videos.map(videoHtml).join("")}
        ${item.images.map((src, n) => `<img id="img-${n + 1}" src="${fileUrl(src)}" alt="${esc(item.title)} 이미지 ${n + 1}" loading="${n < 2 ? "eager" : "lazy"}">`).join("")}
      </div>
    </article>

    <nav class="work-siblings" aria-label="이전·다음 작업">
      ${sibling(prev, "prev")}
      ${sibling(next, "next")}
    </nav>`;
  fadeInImages(page);

  // 활동 목록에서 특정 사진을 눌러 들어왔으면 그 사진 위치로
  // (위쪽 이미지들이 아직 안 받아졌으면 높이를 몰라 엉뚱한 곳으로 가므로, 먼저 받아진 뒤 이동)
  if (location.hash.startsWith("#img-")) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) {
      const imgs = [...page.querySelectorAll(".work-media img")];
      const above = imgs.slice(0, imgs.indexOf(target) + 1);
      above.forEach((im) => (im.loading = "eager"));
      Promise.all(above.map((im) => im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; })))
        .then(() => target.scrollIntoView({ block: "start" }));
    }
  }

  // ← → 키로 이전/다음, Esc로 목록
  document.addEventListener("keydown", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest("input, textarea, [contenteditable]") || $("dialog[open]") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowLeft" && prev) location.href = pageUrl(prev, type);
    if (e.key === "ArrowRight" && next) location.href = pageUrl(next, type);
    if (e.key === "Escape") location.href = back;
  });
}

(async () => {
  inlineLogo(); // 색은 로고를 감싼 요소에 지정되므로 SVG로 바뀌어도 유지됨
  try {
    const data = await loadData();
    contactData = data;
    render(data);
  } catch {
    $("#page").innerHTML = `<p class="empty">works.json을 불러올 수 없습니다. <code>python serve.py</code>로 실행해 주세요.</p>`;
  }
})();
