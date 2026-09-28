// 디자인 시안 공통: 실제 works.json을 읽어 필터 상태를 관리한다. (시안 확인용, 실제 사이트와 무관)
const P = {
  data: null,
  sel: new Set(),
  groupOf: new Map(),
  colorOf: new Map(),
  listeners: [],

  async load() {
    const d = await (await fetch("../works.json", { cache: "no-store" })).json();
    P.data = d;
    d.tagGroups.forEach((g, gi) => g.tags.forEach((t) => {
      P.groupOf.set(t.name, gi);
      P.colorOf.set(t.name, t.color);
    }));
    P.kinds = d.tagGroups[0]?.tags.map((t) => t.name) || [];
    P.genres = d.tagGroups.slice(1).flatMap((g) => g.tags.map((t) => t.name));
    return d;
  },
  // 같은 줄 OR, 다른 줄 AND (실제 사이트와 동일)
  match(w) {
    const by = new Map();
    for (const t of P.sel) {
      const g = P.groupOf.get(t);
      by.set(g, [...(by.get(g) || []), t]);
    }
    return [...by.values()].every((ts) => ts.some((t) => w.tags.includes(t)));
  },
  visible() { return P.data.works.filter(P.match); },
  toggle(tag) {
    P.sel.has(tag) ? P.sel.delete(tag) : P.sel.add(tag);
    P.listeners.forEach((f) => f());
  },
  clear() { P.sel.clear(); P.listeners.forEach((f) => f()); },
  onChange(f) { P.listeners.push(f); },
  url(p) { return p ? "../" + p.split("/").map(encodeURIComponent).join("/") : ""; },
  cover(w) {
    if (w.cover) return P.url(w.cover);
    const v = w.videos?.[0];
    return v ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : "";
  },
  esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); },
  // 시드 고정 난수 (새로고침해도 같은 배치)
  rand(seed) {
    let s = seed * 9301 + 49297;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  },
};

// 시안 전환 바
document.addEventListener("DOMContentLoaded", () => {
  const names = ["인덱스 월", "아치 스트립", "콜라주", "에디토리얼 그리드", "워드마크 스트립", "문장형 필터 (새 제안)"];
  const cur = +(location.pathname.match(/(\d)\.html/)?.[1] || 0);
  const bar = document.createElement("nav");
  bar.className = "switcher";
  bar.innerHTML = names.map((n, i) => `<a href="${i + 1}.html"${cur === i + 1 ? ' class="on"' : ""}>${i + 1}. ${n}</a>`).join("");
  document.body.appendChild(bar);
});
