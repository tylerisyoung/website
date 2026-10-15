/*
 * Policy Priorities dashboard: user interface.
 * Reads data.json, runs the engine in engine.js and draws every tab with
 * plain HTML tables and inline SVG charts.
 */
(function () {
  "use strict";

  const BCA = window.BCA;
  const { GRADES, slog, isNA } = BCA;

  // ---- Constants shared with the R version ------------------------------------------
  const GRADE_COLS = { "A+": "#3d6fd6", A: "#5b8def", "A-": "#8db0f3", "B+": "#c9982e", B: "#e3b453", "B-": "#efd08a",
    "C+": "#c75b5b", C: "#e07a7a", "C-": "#eca7a7" };
  const PAL = { blue: "#5b8def", blue_lt: "#a8c5f7", yellow: "#f2c46d", red: "#e07a7a", green: "#76bf94", ink: "#2d3a4a" };
  const TIERS = ["Excellent", "Good", "Mid", "Bad", "Worst"];
  const TIER_COLS = { Excellent: "#1f4e9c", Good: "#8db8ef", Mid: "#f2c94c", Bad: "#ef9a9a", Worst: "#a61c1c" };
  const TIER_RULE = { Excellent: "$10+ per $1", Good: "$2–10", Mid: "$1–2", Bad: "under $1", Worst: "below zero" };
  const tierOf = (m) => (m >= 10 ? "Excellent" : m >= 2 ? "Good" : m >= 1 ? "Mid" : m >= 0 ? "Bad" : "Worst");
  const tierCol = (x) => TIER_COLS[tierOf(x.bcr_median)];
  const tierBadge = (t) => `<span class="gb" style="background:${TIER_COLS[t]};color:${t === "Mid" || t === "Good" || t === "Bad" ? "#2d3a4a" : "#ffffff"}">${t}</span>`;
  const tierKey = () => `<div class="gkey"><div class="gkey-t">Colour = verdict: the middle result per dollar spent</div><div class="gkey-row">${TIERS.map((t) => `${tierBadge(t)} <span class="meta">${TIER_RULE[t]}</span>`).join(" &nbsp; ")}</div></div>`;
  const DIFF_COLS = { easy: PAL.blue, moderate: PAL.yellow, hard: PAL.red };
  // Net-value bars use the same colours on the Ranking and Budget tabs
  const NET_COLS = () => [PAL.blue, PAL.yellow, PAL.red, PAL.red];
  const GOOD_COL = TIER_COLS.Excellent, BAD_COL = TIER_COLS.Worst;
  const WHO_LABEL = { "pro-poor": "Mostly the poor", broad: "Everyone", regressive: "Mostly the better-off" };
  const TYPE_LABEL = { peer_reviewed: "Peer-reviewed", book: "Book", working_paper: "Working paper",
    think_tank: "Think tank", government: "Government", intl_org: "International body" };
  const DARK_TEXT_GRADES = ["A-", "B+", "B", "B-", "C-"];
  const AX = [-1, 0, 0.3, 1, 3, 10, 30, 100, 300, 1000, 3000];
  const TOP_N = 20;

  const RUBRIC = [
    ["A+", "Several peer-reviewed benefit-cost studies, including randomized or controlled trials, with consistent, statistically significant results."],
    ["A", "Peer-reviewed benefit-cost estimates backed by controlled or quasi-experimental studies."],
    ["A-", "One peer-reviewed benefit-cost estimate, or a peer-reviewed meta-analysis whose effects convert directly into a benefit-cost ratio."],
    ["B+", "Peer-reviewed natural experiments or historical comparisons that measure the size of the gain (GDP, welfare, prices, lives), converted into a ratio."],
    ["B", "Published economic theory in peer-reviewed journals or academic books, supported by historical cases and quantified in published models."],
    ["B-", "Official estimates from government or international bodies (CBO, GAO, IMF, OECD, World Bank, regulators' own impact analyses)."],
    ["C+", "Think-tank studies with stated methods and numbers (Cato, Mercatus, Heritage, Tax Foundation, AEI, Reason, IEA, Fraser and others)."],
    ["C", "Books and published arguments by economists with historical illustrations, where the numbers come from think-tank or secondary estimates."],
    ["C-", "Published theory only: never tried at scale, and the ratio is built by analogy from related evidence."],
  ];

  // Official development aid (OECD DAC donors), $ billions
  const ODA = { 2023: 223.7, 2024: 214.6, 2025: 174.3, 2026: 174.3 * (1 - 0.058) };
  const AVAIL_YR = ODA[2025];
  const OECD_2025 = "https://www.oecd.org/en/data/insights/data-explainers/2026/04/a-historic-decline-in-foreign-aid-preliminary-2025-oda-data.html";
  const CONTEXT = [
    ["Global fossil-fuel subsidies, 2024 (explicit $725B plus unpriced pollution and climate costs)", 7400,
      "IMF Working Paper 25/270 (2025 update)", "https://www.elibrary.imf.org/view/journals/001/2025/270/article-A001-en.xml"],
    ["UN estimate of the yearly gap to fund the Sustainable Development Goals (2026 report)", 4000,
      "UN Financing for Sustainable Development Report 2026", "https://desapublications.un.org/publications/financing-sustainable-development-report-2026"],
    ["Global climate finance, 2025 (estimate)", 2100,
      "Climate Policy Initiative, Global Landscape of Climate Finance 2026", "https://glcf.climatepolicyinitiative.org/"],
    ["Official development aid from rich-country donors, 2025", ODA[2025], "OECD, preliminary 2025 ODA data (April 2026)", OECD_2025],
    ["World Bank Group lending commitments to partner countries, fiscal 2025", 118.5,
      "World Bank Group Annual Report 2025", "https://www.worldbank.org/en/about/annual-report/financial-summary"],
    ["US official development aid, 2025 (down 57% from 2024)", 29.0, "OECD, preliminary 2025 ODA data (April 2026)", OECD_2025],
  ];

  // ---- Formatting ------------------------------------------------------------------
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (x) => (x === null || x === undefined || (typeof x === "number" && isNaN(x)) ? "" : String(x)).replace(/[&<>"']/g, (c) => ESC[c]);
  const isBlank = (s) => s === null || s === undefined || s === "";
  const comma = (s) => {
    const neg = s[0] === "-";
    const [i, d] = (neg ? s.slice(1) : s).split(".");
    return (neg ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d !== undefined ? "." + d : "");
  };
  // Round half to even, as R does for exact halves
  const rround = (x) => {
    const r = Math.round(x);
    return Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : r;
  };
  // Three significant digits without scientific notation
  const sig3 = (x) => {
    const v = Number(x.toPrecision(3));
    let s = String(v);
    if (/e/.test(s)) s = v.toFixed(Math.max(0, 2 - Math.floor(Math.log10(Math.abs(v)))));
    return comma(s);
  };
  const fmtBcr = (x) => isNA(x) ? "—"
    : Math.abs(x) >= 100 ? comma(x.toFixed(0))
    : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2);
  const fmtBn = (x) => isNA(x) ? "—"
    : x < 0 ? "saves $" + sig3(-x) + "B"
    : x === 0 ? "$0"
    : x >= 1000 ? "$" + (x / 1000).toFixed(1) + "T"
    : "$" + sig3(x) + "B";
  const money = (x) => (x < 0 ? "−" + fmtBn(-x) : fmtBn(x));
  const fmtPct = (x) => rround(100 * x) + "%";
  const titleCase = (s) => (isBlank(s) ? "" : s.charAt(0).toUpperCase() + s.slice(1));
  const trimNum = (v) => String(Number(v.toPrecision(10)));
  const badge = (g) => `<span class="gb" style="background:${GRADE_COLS[g] || "#999"};color:${DARK_TEXT_GRADES.includes(g) ? "#2d3a4a" : "#ffffff"}">${esc(g)}</span>`;
  const srcLink = (url, doi) => {
    const u = !isBlank(doi) ? "https://doi.org/" + doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "") : url;
    return isBlank(u) ? "" : ` <a href="${esc(u)}" target="_blank" rel="noopener">link</a>`;
  };
  const yearOf = (y) => (isBlank(y) ? "n.d." : y);

  // ---- State -----------------------------------------------------------------------
  const DEFAULTS = { skep: 0.5, t_feas: 0.5, minbcr: 1 };
  const OPT_DEFAULTS = { view: "mid", deaths: true };
  const state = { ...DEFAULTS, ...OPT_DEFAULTS, cats: null };
  let DATA, MODEL, POL_BY_ID, SRC_BY_POL, PUB_RANK, N_WORKS, CATS;
  let res = null;           // current run, all policies, best first
  let shown = null;         // after filters
  let currentTab = "ranking";
  const dirty = new Set();

  function compute() {
    const tilts = { equity: 0, feasibility: (state.t_feas - 0.5) * 2, cost: 0 };
    res = BCA.runBca(MODEL, { skepticism: state.skep, tilts, view: state.view, deaths: state.deaths });
    applyFilters();
  }
  function applyFilters() {
    shown = res.filter((r) => state.cats.has(r.category));
  }

  // ---- SVG helpers -------------------------------------------------------------------
  const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const measureCtx = document.createElement("canvas").getContext("2d");
  function textWidth(s, px, bold) {
    measureCtx.font = `${bold ? "700 " : ""}${px}px ${FONT}`;
    return measureCtx.measureText(s).width;
  }
  function fitText(s, px, maxW, bold) {
    if (textWidth(s, px, bold) <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (textWidth(s.slice(0, mid) + "…", px, bold) <= maxW) lo = mid; else hi = mid - 1;
    }
    return s.slice(0, Math.max(1, lo)).trimEnd() + "…";
  }
  // Splits a label into at most two lines that fit maxW (the second is cut with "…" only if still too long).
  function wrapLabel(s, px, maxW) {
    if (textWidth(s, px) <= maxW) return [s];
    const w = s.split(" ");
    let a = "", k = 0;
    for (; k < w.length; k++) { const t = a ? a + " " + w[k] : w[k]; if (textWidth(t, px) > maxW) break; a = t; }
    if (!a) return [fitText(s, px, maxW)];
    return [a, fitText(w.slice(k).join(" "), px, maxW)];
  }
  const f1 = (v) => Math.round(v * 10) / 10;
  const svgOpen = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`;
  const txt = (x, y, s, o = {}) => `<text x="${f1(x)}" y="${f1(y)}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.base ? ` dominant-baseline="${o.base}"` : ""} font-size="${o.size || 11}"${o.bold ? ' font-weight="700"' : ""}${o.italic ? ' font-style="italic"' : ""} fill="${o.fill || "#222"}">${esc(s)}</text>`;
  const line = (x1, y1, x2, y2, stroke, o = {}) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" stroke-width="${o.w || 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.op ? ` stroke-opacity="${o.op}"` : ""}${o.cap ? ` stroke-linecap="${o.cap}"` : ""}/>`;
  const rect = (x, y, w, h, fill, o = {}) => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(0, w))}" height="${f1(Math.max(0, h))}" fill="${fill}"${o.op ? ` fill-opacity="${o.op}"` : ""}${o.rx ? ` rx="${o.rx}"` : ""}/>`;
  const circle = (x, y, r, fill, o = {}) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}"${o.op ? ` fill-opacity="${o.op}"` : ""}${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ""}>${o.title ? `<title>${esc(o.title)}</title>` : ""}</circle>`;

  // Linear scale with R's default 4% padding on each side of the limits
  function scale(lim, a, b) {
    const pad = 0.04 * (lim[1] - lim[0]);
    const lo = lim[0] - pad, hi = lim[1] + pad;
    const f = (v) => a + ((v - lo) / (hi - lo)) * (b - a);
    f.lo = lo; f.hi = hi;
    return f;
  }

  // R's pretty(): about five round tick values covering the range
  function pretty(lo, hi, n = 5) {
    const h = 1.5, h5 = 0.5 + 1.5 * h;
    const dx = hi - lo;
    let cell = Math.max(Math.abs(lo), Math.abs(hi));
    if (dx === 0 && cell === 0) return [0];
    cell = dx === 0 ? cell : dx;
    cell /= n;
    const U = Math.pow(10, Math.floor(Math.log10(cell)));
    let unit = U;
    if (2 * U - cell < h * (cell - unit)) { unit = 2 * U;
      if (5 * U - cell < h5 * (cell - unit)) { unit = 5 * U;
        if (10 * U - cell < h * (cell - unit)) unit = 10 * U; } }
    let ns = Math.floor(lo / unit + 1e-7), nu = Math.ceil(hi / unit - 1e-7);
    while (ns * unit > lo + 1e-10 * unit) ns--;
    while (nu * unit < hi - 1e-10 * unit) nu++;
    let k = Math.floor(0.5 + nu - ns);
    const minN = Math.floor(n / 3);
    if (k < minN) {
      k = minN - k;
      if (ns >= 0) { nu += Math.floor(k / 2); ns -= Math.floor(k / 2) + (k % 2); }
      else { ns -= Math.floor(k / 2); nu += Math.floor(k / 2) + (k % 2); }
    }
    const out = [];
    for (let i = ns; i <= nu; i++) out.push(Number((i * unit).toPrecision(12)));
    return out;
  }

  const chartWidth = (el) => Math.max(300, Math.floor(el.clientWidth || el.parentElement.clientWidth || 800));
  const labOf = (r) => `${r.rank}. ${r.title.length > 58 ? r.title.slice(0, 57) + "…" : r.title}`;
  const rowH = (n) => Math.max(300, 17 * n + 90);

  // Shared frame for the three charts with one row per policy: labels on the left,
  // alternate row shading and dotted guides, red end labels above the plot.
  function rowChart(el, o) {
    const n = o.labels.length;
    if (!n) { el.innerHTML = '<div class="empty">No policies match the filters.</div>'; return; }
    const W = chartWidth(el);
    const labPx = W < 560 ? 10 : 11.5;
    const maxLab = Math.max(...o.labels.map((s) => textWidth(s, labPx)));
    const labW = Math.min(maxLab, W * (o.labFrac || (W < 560 ? 0.5 : 0.58)));
    // full policy names: a label too wide for the column wraps onto a second line, and every row grows to fit
    const labLines = o.labels.map((s) => wrapLabel(s, labPx, labW));
    const wrapped = labLines.some((l) => l.length > 1);
    const H = o.height + (wrapped ? Math.round(n * labPx * 1.05) : 0);
    const L = labW + 14, R = W - o.right, T = o.top, B = H - o.bottom;
    const sx = scale(o.xlim, L, R);
    const sy = scale([0.5, n + 0.5], B, T);
    const ys = o.labels.map((_, i) => n - i);
    let s = svgOpen(W, H);
    // end labels
    s += txt(W < 560 ? 4 : L, T - 10, o.endL, { size: W < 560 ? 13 : 15.5, bold: true, fill: "#e07a7a" });
    s += txt(R, T - 10, o.endR, { size: W < 560 ? 13 : 15.5, bold: true, fill: "#e07a7a", anchor: "end" });
    // zebra bands across the labels and plot, then dotted guides
    ys.forEach((y, i) => { if (i % 2 === 0) s += rect(0, sy(y + 0.5), R, sy(y - 0.5) - sy(y + 0.5), "#eef1f6"); });
    ys.forEach((y) => { s += line(sx(sx.lo), sy(y), R, sy(y), "#c9d2df", { w: 0.7, dash: "1.5 2.5" }); });
    s += o.grid(sx, T, B);
    s += o.marks(sx, sy, ys);
    // y labels
    o.labels.forEach((lab, i) => {
      const ls = labLines[i], cut = ls.join(" ") !== lab, tip = cut ? `<title>${esc(lab)}</title>` : "";
      if (ls.length === 1) { s += `<text x="${f1(L - 6)}" y="${f1(sy(ys[i]))}" text-anchor="end" dominant-baseline="central" font-size="${labPx}" fill="#222">${tip}${esc(ls[0])}</text>`; return; }
      const lh = labPx * 1.05, y0 = sy(ys[i]) - lh / 2;
      s += `<text x="${f1(L - 6)}" y="${f1(y0)}" text-anchor="end" dominant-baseline="central" font-size="${labPx}" fill="#222">${tip}` +
        `<tspan x="${f1(L - 6)}" y="${f1(y0)}">${esc(ls[0])}</tspan><tspan x="${f1(L - 6)}" y="${f1(y0 + lh)}">${esc(ls[1])}</tspan></text>`;
    });
    // x axis
    s += line(sx(o.xticks[0]), B, sx(o.xticks[o.xticks.length - 1]), B, "#333");
    o.xticks.forEach((v, i) => {
      s += line(sx(v), B, sx(v), B + 5, "#333");
      s += txt(sx(v), B + 17, o.xtickLabels[i], { size: 10.5, anchor: "middle" });
    });
    s += txt((L + R) / 2, B + (o.xlabBold ? 44 : 36), o.xlab, { size: o.xlabBold ? (W < 560 ? 10 : 12) : 11.5, anchor: "middle", bold: !!o.xlabBold, fill: o.xlabBold ? "#2d3a4a" : "#222" });
    s += "</svg>";
    el.innerHTML = s;
  }

  // ---- Ranking tab charts ----------------------------------------------------------------
  function drawRankPlot() {
    const el = document.getElementById("rank_plot");
    const r = shown;
    const vals = [];
    r.forEach((x) => { vals.push(slog(x.bcr_q05), slog(x.bcr_q95)); });
    vals.push(slog(0.3), slog(10));
    const xr = [Math.min(...vals), Math.max(...vals)];
    const ax = AX.filter((a) => slog(a) >= xr[0] - 0.05 && slog(a) <= xr[1] + 0.05);
    rowChart(el, {
      labels: r.map(labOf), height: rowH(r.length) + 70, top: 40, bottom: 70, right: 14,
      xlim: xr, xticks: ax.map(slog), xtickLabels: ax.map((a) => comma(String(a))),
      xlab: "Adjusted benefit-cost ratio: dollars of benefit per $1 spent (log scale; dashed line = 1, break-even)", xlabBold: true,
      endL: "Destroys value", endR: "Best return",
      grid: (sx, T, B) => ax.map((a) => line(sx(slog(a)), T, sx(slog(a)), B, "#eeeeee")).join("") +
        line(sx(slog(1)), T, sx(slog(1)), B, "#666666", { dash: "4 4" }),
      marks: (sx, sy, ys) => r.map((x, i) => {
        const c = tierCol(x);
        const tip = `${x.title}: ${fmtBcr(x.bcr_median)} (90% range ${fmtBcr(x.bcr_q05)} – ${fmtBcr(x.bcr_q95)}), ${tierOf(x.bcr_median)}`;
        return line(sx(slog(x.bcr_q05)), sy(ys[i]), sx(slog(x.bcr_q95)), sy(ys[i]), c, { w: 3, op: 0.55 }) +
          circle(sx(slog(x.bcr_median)), sy(ys[i]), 4.2, c, { title: tip });
      }).join(""),
    });
  }

  function drawXY() {
    const el = document.getElementById("xy_plot");
    const r = shown;
    if (!r.length) { el.innerHTML = '<div class="empty">No policies match the filters.</div>'; return; }
    const W = chartWidth(el), H = W < 560 ? 760 : 720;  // taller on phones so full policy names have room
    const cx = r.map((x) => Math.log10(1 + Math.max(isNA(x.cost_bn) ? 0 : x.cost_bn, 0)));
    const cy = r.map((x) => slog(x.bcr_median));
    const xr = [-0.15, Math.max(Math.max(...cx), 1) * 1.08];
    const yr = [Math.min(...cy, 0) - 0.15, Math.max(...cy, 0) + 0.2];
    const L = 58, R = W - 14, T = 40, B = H - 58;
    const sx = scale(xr, L, R), sy = scale(yr, B, T);
    let s = svgOpen(W, H);
    s += `<defs><clipPath id="xyclip"><rect x="${L}" y="${T}" width="${R - L}" height="${B - T}"/></clipPath></defs>`;
    s += txt(L, T - 10, "Cheap", { size: W < 560 ? 13 : 15.5, bold: true, fill: "#e07a7a" });
    s += txt(R, T - 10, "Expensive", { size: W < 560 ? 13 : 15.5, bold: true, fill: "#e07a7a", anchor: "end" });
    // best-buys region: cheap (under $10B a year) and a ratio above 10
    const bx1 = sx(Math.log10(11)), by = sy(slog(10));
    s += `<g clip-path="url(#xyclip)">${rect(L, T, bx1 - L, by - T, "#eaf1fd")}</g>`;
    s += txt(sx(xr[0] + 0.02), sy(yr[1] - 0.05) + 10, "Best buys: cheap and high-return", { size: 10, italic: true, fill: "#3d6fd6" });
    // axes
    const xt = [0, 1, 10, 100, 1000, 10000, 100000].filter((v) => Math.log10(1 + v) <= xr[1]);
    s += line(sx(Math.log10(1 + xt[0])), B, sx(Math.log10(1 + xt[xt.length - 1])), B, "#333");
    xt.forEach((v) => { const x = sx(Math.log10(1 + v)); s += line(x, B, x, B + 5, "#333") + txt(x, B + 17, comma(String(v)), { size: 10.5, anchor: "middle" }); });
    const yt = AX.filter((a) => slog(a) >= yr[0] && slog(a) <= yr[1]);
    s += line(L, sy(slog(yt[0])), L, sy(slog(yt[yt.length - 1])), "#333");
    yt.forEach((v) => { const y = sy(slog(v)); s += line(L - 5, y, L, y, "#333") + txt(L - 8, y, comma(String(v)), { size: 10.5, anchor: "end", base: "central" }); });
    s += txt((L + R) / 2, B + 40, "Cost per year, $ billions (log scale; 0 = no fiscal cost)", { size: 11.5, anchor: "middle" });
    s += `<text transform="translate(16 ${f1((T + B) / 2)}) rotate(-90)" text-anchor="middle" font-size="11.5" fill="#222">Adjusted benefit-cost ratio (log scale)</text>`;
    s += line(L, sy(slog(1)), R, sy(slog(1)), "#7f7f7f", { dash: "4 4" });
    s += txt(R - 2, sy(slog(1)) - 4, "break-even", { size: 9, anchor: "end", fill: "#666666" });
    // Labels carry the full policy name. Each sits right of its dot, or left of it when it would run past
    // the plot edge; labels whose boxes overlap are pushed apart vertically (in pixels).
    const fs = W < 560 ? 8.5 : 10, pad = 3;
    const lab = r.map((x, i) => {
      const name = x.short || x.title, w = textWidth(name, fs), px = sx(cx[i]);
      const right = px + 9 + w <= R || px - 9 - w < 2;
      const x0 = right ? Math.max(2, Math.min(px + 9, W - 2 - w)) : px - 9 - w;  // never run off the chart
      return { name, w, px, py: sy(cy[i]), right, x0, y: sy(cy[i]) };
    });
    const gap = fs + 2;
    for (let it = 0; it < 120; it++) {
      let moved = false;
      for (let i = 0; i < lab.length; i++) for (let j = i + 1; j < lab.length; j++) {
        const A = lab[i], Bb = lab[j];
        if (A.x0 < Bb.x0 + Bb.w + pad && Bb.x0 < A.x0 + A.w + pad && Math.abs(A.y - Bb.y) < gap) {
          const d = (gap - Math.abs(A.y - Bb.y)) / 2 + 0.05;
          if (A.y > Bb.y || (A.y === Bb.y && i > j)) { A.y += d; Bb.y -= d; } else { A.y -= d; Bb.y += d; }
          moved = true;
        }
      }
      lab.forEach((q) => { q.y = Math.min(B - 4, Math.max(T + 4, q.y)); });
      if (!moved) break;
    }
    lab.forEach((q) => { s += line(q.px, q.py, q.right ? q.x0 - 1 : q.x0 + q.w + 1, q.y, "#bfbfbf", { w: 0.6 }); });
    r.forEach((x, i) => {
      s += circle(sx(cx[i]), sy(cy[i]), 6.5, tierCol(x), { op: 0.9, stroke: "#ffffff", sw: 1,
        title: `${x.title}: ratio ${fmtBcr(x.bcr_median)}, cost ${fmtBn(x.cost_bn)} a year, ${tierOf(x.bcr_median)}` });
    });
    lab.forEach((q) => {
      s += `<text x="${f1(q.x0)}" y="${f1(q.y)}" dominant-baseline="central" font-size="${fs}" fill="#262626" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke">${esc(q.name)}</text>`;
    });
    // legend
    const lx = R - 150, ly0 = T + 8;
    s += txt(lx, ly0 + 4, "Verdict", { size: 10.5 });
    TIERS.forEach((k, i) => {
      const yy = ly0 + 22 + i * 17;
      s += circle(lx + 8, yy, 6, TIER_COLS[k], { stroke: "#ffffff" }) + txt(lx + 20, yy, k, { size: 10.5, base: "central" });
    });
    s += "</svg>";
    el.innerHTML = s;
  }

  // Net-value chart (Ranking and Budget tabs)
  function budgetFigures() {
    const best = BCA.fundBudget(shown, AVAIL_YR, state.minbcr);
    const bestSpend = BCA.sum(best, (x) => x.spend);
    const worst = BCA.fundWorst(res, bestSpend, 10);
    const worstFull = BCA.fundWorstFull(res, 10);
    const bestFull = BCA.fundBestFull(res, 10);
    return {
      best, bestSpend, worst, worstFull, bestFull,
      bestNet: BCA.sum(best, (x) => x.net), worstNet: BCA.sum(worst, (x) => x.net),
      worstFullNet: BCA.sum(worstFull, (x) => x.net), bestFullNet: BCA.sum(bestFull, (x) => x.net),
    };
  }

  function drawBudget(el, colsFor, thin, height, F, o = {}) {
    const nets = [F.bestNet, F.bestFullNet, F.worstNet, F.worstFullNet].map((v) => v / 1000);   // $ trillions
    const nfree = F.bestFull.filter((x) => x.spend === 0 && x.priced).length;
    const labs = [
      `Best buys, aid budget (ratio > ${state.minbcr}): $${F.bestSpend.toFixed(0)}B`,
      `10 best, fully implemented: $${BCA.sum(F.bestFull, (x) => x.spend).toFixed(0)}B/yr + ${nfree} free reform${nfree === 1 ? "" : "s"}`,
      `10 worst, same money: $${BCA.sum(F.worst, (x) => x.spend).toFixed(0)}B`,
      `10 worst, fully implemented: $${(BCA.sum(F.worstFull, (x) => x.spend) / 1000).toFixed(1)}T/yr`,
    ];
    const cols = colsFor(nets);
    const W = chartWidth(el);
    const stacked = W < 640;                     // narrow screens: labels above the bars
    const labPx = stacked ? 11 : 11.5;
    const labW = stacked ? 0 : Math.max(...labs.map((s) => textWidth(s, labPx, true)));
    const H = stacked ? height + 70 : height;
    const L = stacked ? 12 : labW + 22, R = W - (stacked ? 12 : 28), T = 40, B = H - 46;
    const lo0 = Math.min(...nets, 0), hi0 = Math.max(...nets, 0);
    // o.symmetric: zero sits in the middle, so both sides take exactly the same width
    const mAbs = Math.max(-lo0, hi0) * 1.15;
    const xr = o.symmetric ? [-mAbs, mAbs] : [lo0 * 1.15, hi0 + (hi0 - lo0) * 0.12];
    const sx = scale(xr, L, R), sy = scale([0.4, 4.6], B, T);
    const hw = thin ? 0.24 : 0.32;
    let ticks = pretty(xr[0], xr[1]).filter((v) => v >= sx.lo && v <= sx.hi);
    if (o.symmetric && stacked && ticks.length > 5) {
      const z = ticks.indexOf(0);
      ticks = ticks.filter((_, i) => z < 0 ? i % 2 === 0 : (i - z) % 2 === 0);
    }
    let s = svgOpen(W, H);
    if (o.symmetric) {
      // two equal halves, each tinted and titled in the middle of its own side
      const mid = sx(0), endPx = stacked ? 15 : 20;
      s += rect(sx(xr[0]), T, mid - sx(xr[0]), B - T, PAL.red, { op: 0.08 });
      s += rect(mid, T, sx(xr[1]) - mid, B - T, PAL.blue, { op: 0.08 });
      s += `<text x="${f1((sx(xr[0]) + mid) / 2)}" y="${f1(T - 12)}" text-anchor="middle" font-size="${endPx}" font-weight="800" fill="${BAD_COL}">Value destroyed</text>`;
      s += `<text x="${f1((mid + sx(xr[1])) / 2)}" y="${f1(T - 12)}" text-anchor="middle" font-size="${endPx}" font-weight="800" fill="${GOOD_COL}">Value created</text>`;
    } else {
      s += txt(L, T - 10, "Value destroyed", { size: stacked ? 13 : 15.5, bold: true, fill: "#e07a7a" });
      s += txt(R, T - 10, "Value created", { size: stacked ? 13 : 15.5, bold: true, fill: "#e07a7a", anchor: "end" });
    }
    ticks.forEach((v) => { s += line(sx(v), T, sx(v), B, "#eeeeee"); });
    s += line(sx(0), T, sx(0), B, "#666666");
    const ys = [4, 3, 2, 1];
    nets.forEach((v, i) => {
      const y = ys[i];
      const x0 = sx(Math.min(0, v)), x1 = sx(Math.max(0, v));
      const yTop = sy(y + hw), yBot = sy(y - hw);
      s += rect(x0, yTop, x1 - x0, yBot - yTop, cols[i]);
      const lab = `${v < 0 ? "−" : "+"}$${Math.abs(v).toFixed(1)}T`;
      const right = v >= 0;
      let lx = right ? x1 + 6 : x0 - 6, anchor = right ? "start" : "end";
      const lw = textWidth(lab, 12, true);
      if (right && lx + lw > W - 2) { lx = x1 - 6; anchor = "end"; }
      if (!right && lx - lw < (stacked ? 2 : L)) { lx = x0 + 6; anchor = "start"; }
      s += txt(lx, (yTop + yBot) / 2, lab, { size: 12, bold: true, anchor, base: "central", fill: "#333333" });
      if (stacked) s += txt(L, yTop - 5, fitText(labs[i], labPx, R - L, true), { size: labPx, bold: true, fill: "#222" });
      else s += txt(L - 8, (yTop + yBot) / 2, labs[i], { size: labPx, bold: true, anchor: "end", base: "central", fill: "#222" });
    });
    s += line(sx(ticks[0]), B, sx(ticks[ticks.length - 1]), B, "#333");
    ticks.forEach((v) => {
      s += line(sx(v), B, sx(v), B + 5, "#333");
      s += txt(sx(v), B + 17, `${v < 0 ? "−" : ""}$${trimNum(Math.abs(v))}T`, { size: 10.5, anchor: "middle" });
    });
    s += txt((L + R) / 2, B + 38, "Net value, $ trillions per year", { size: 11.5, anchor: "middle" });
    s += "</svg>";
    el.innerHTML = s;
  }

  // ---- Tables ----------------------------------------------------------------------------
  const tableWrap = (head, rows) => `<div class="tscroll"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;

  function rankTable() {
    const rows = shown.map((r) => `<tr><td class="num">${r.rank}</td><td class="pn">${esc(r.title)}</td><td>${esc(r.category)}</td><td>${tierBadge(tierOf(r.bcr_median))}</td><td>${badge(r.grade)}</td>` +
      `<td class="num">${fmtBcr(r.bcr_low)} – ${fmtBcr(r.bcr_high)}</td><td class="num"><b>${fmtBcr(r.bcr_median)}</b> <span class="meta">(${fmtBcr(r.bcr_q05)} – ${fmtBcr(r.bcr_q95)})</span></td>` +
      `<td class="num">${fmtBn(r.cost_bn)}</td><td>${esc(titleCase(r.difficulty))}</td><td>${esc(WHO_LABEL[r.who_benefits])}</td><td class="num">${r.score.toFixed(2)}</td><td class="num">${fmtPct(r.p_top)}</td></tr>`);
    return tableWrap('<th class="num">Rank</th><th>Policy</th><th>Area</th><th>Verdict</th><th>Grade</th><th class="num">Published ratio range</th><th class="num">Adjusted ratio (90% range)</th><th class="num">Cost / yr</th><th>Difficulty</th><th>Who benefits</th><th class="num">Score</th><th class="num">Top-20 chance</th>', rows);
  }

  function budgetTable(f) {
    const rows = f.map((r) => `<tr><td class="num">${r.rank}</td><td>${esc(r.title)}</td><td>${badge(r.grade)}</td><td class="num">${fmtBn(r.cost_bn)}</td><td class="num"><b>${fmtBcr(r.bcr_median)}</b></td>` +
      `<td class="num">${r.cost_used > 0 ? (r.benefit_bn < 0 ? "−" + fmtBn(-r.benefit_bn) : fmtBn(r.benefit_bn)) : "—"}</td>` +
      `<td class="num" style="color:${r.net_bn < 0 ? BAD_COL : GOOD_COL}">${r.cost_used > 0 ? money(r.net_bn) : "no fiscal cost"}</td></tr>`);
    return tableWrap('<th class="num">Rank</th><th>Policy</th><th>Grade</th><th class="num">Cost / yr</th><th class="num">Adjusted ratio</th><th class="num">Benefits / yr</th><th class="num">Net / yr</th>', rows);
  }

  // One set of per-policy death figures, shared by the Deaths chart and table.
  // Caused: deaths from lost income (one per $99.3m of income lost; for health programmes this is the
  // income lost to the taxes that fund them). Saved: lives saved directly, as published in each health
  // programme's sources (lives_lo to lives_hi, midpoint used), plus lives saved from net income gained.
  // Infant deaths in poor countries overlap with deaths from lost income, so they are shown but not netted.
  const numOr0 = (x) => { const v = isBlank(x) ? NaN : Number(x); return isNA(v) ? 0 : v; };
  function deathsRows() {
    const rows = res.map((r, i) => {
      const m = POL_BY_ID.get(r.id);
      const base = isNA(m.base_bn) ? m.cost_bn : m.base_bn;
      const gain = m.gain_bn;
      const net = !isNA(base) && base > 0 ? base * (r.bcr_median - 1) : (isNA(gain) ? 0 : gain);
      const dead = m.mort_b === 1 && net >= 0 ? 0 : (m.income_loss_bn / 99.3) * 1000;
      const savedInc = m.mort_b === 1 && net > 0 ? (net / 99.3) * 1000 : 0;
      const dlo = numOr0(m.lives_lo), dhi = numOr0(m.lives_hi);
      const direct = (dlo + dhi) / 2;
      const ilo = isNA(m.emde_loss_lo) ? 0 : m.emde_loss_lo * 0.24 * 119.9 * 1000;
      const ihi = isNA(m.emde_loss_hi) ? 0 : m.emde_loss_hi * 0.4 * 119.9 * 1000;
      const lives = direct + savedInc - dead;
      return { r, net, dead, savedInc, direct, dlo, dhi, basis: m.lives_basis || "", ilo, ihi, lives, i };
    });
    rows.sort((a, b) => (b.lives - a.lives) || (a.i - b.i));
    return rows;
  }

  function deathsTable(rows) {
    const n0 = (x) => (x <= 0 ? "—" : comma(String(rround(x))));
    const sgn = (x) => { const v = rround(x); return v === 0 ? "0" : (v < 0 ? "−" : "+") + comma(String(Math.abs(v))); };
    const col = (x) => (x < 0 ? "#c75b5b" : x > 0 ? "#3a8f5c" : "inherit");
    const html = rows.map(({ r, net, dead, savedInc, direct, dlo, dhi, basis, ilo, ihi, lives }) => {
      const dcell = direct <= 0 ? "—" : n0(direct) + (dhi > dlo ? `<br><span class="meta">(${n0(dlo) === "—" ? "0" : n0(dlo)} – ${n0(dhi)})</span>` : "");
      return `<tr><td class="num">${r.rank}</td><td class="pn">${esc(r.title)}</td>` +
        `<td class="num"${basis ? ` title="${esc(basis)}"` : ""}>${dcell}</td><td class="num">${n0(savedInc)}</td><td class="num">${n0(dead)}</td>` +
        `<td class="num">${ihi > 0 ? n0(ilo) + " – " + n0(ihi) : "—"}</td>` +
        `<td class="num" style="color:${col(lives)}"><b>${sgn(lives)}</b></td><td class="num" style="color:${col(lives)}">${sgn(lives * 20)}</td>` +
        `<td class="num" style="color:${net < 0 ? "#c75b5b" : "#3a8f5c"}">${money(net)}</td></tr>`;
    });
    return tableWrap('<th class="num">Rank</th><th>Policy</th><th class="num">Lives saved directly a year</th><th class="num">Lives saved a year from income gained</th><th class="num">Deaths a year from lost income</th><th class="num">Infant deaths a year, poor countries</th><th class="num">Net lives a year</th><th class="num">Net lives over 20 years</th><th class="num">Net value per year</th>', html);
  }

  // Deaths chart: every policy ranked from most lives saved (top) to most deaths caused (bottom),
  // on a signed log scale. Same figures as the Deaths table.
  function drawDeaths(el, rows) {
    const d = rows.map((x) => ({ r: x.r, v: x.lives, saved: x.direct + x.savedInc, dead: x.dead, i: x.i }))
      .sort((a, b) => (b.v - a.v) || (a.i - b.i));
    const vs = d.map((x) => slog(x.v));
    const mx = Math.max(1, ...vs.map(Math.abs));
    const narrow = chartWidth(el) < 560;
    const ticksAll = [0, 1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000];
    const pos = ticksAll.filter((t) => slog(t) <= mx + 0.3);
    const xt = [...pos.slice(1).reverse().map((t) => -t), ...pos];
    // narrow screens label zero and one middle decade each side; grid lines stay on every decade
    const midDec = Math.pow(10, Math.max(1, Math.round(mx / 2)));
    const xtLab = narrow ? xt.filter((t) => t === 0 || Math.abs(t) === midDec) : xt;
    const lab = (t) => (t === 0 ? "0" : (t < 0 ? "−" : "") + (Math.abs(t) >= 1e6 ? Math.abs(t) / 1e6 + "M" : Math.abs(t) >= 1000 ? Math.abs(t) / 1000 + "k" : String(Math.abs(t))));
    const n0 = (x) => comma(String(rround(Math.abs(x))));
    const short = (x) => { const a = rround(Math.abs(x)); return a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e4 ? Math.round(a / 1000) + "k" : a >= 1000 ? (a / 1000).toFixed(1) + "k" : String(a); };
    const k = narrow ? 1.4 : 1.12;
    rowChart(el, {
      labels: d.map((x) => labOf(x.r)), height: rowH(d.length) + 40, top: 40, bottom: 50, right: narrow ? 6 : 14,
      labFrac: narrow ? 0.42 : 0,
      xlim: [-mx * k, mx * k], xticks: xtLab.map(slog), xtickLabels: xtLab.map(lab),
      xlab: narrow ? "Net lives a year, log scale" : "Net deaths caused (left) or net lives saved (right) per year, log scale", endL: "Causes deaths", endR: "Saves lives",
      grid: (sx, T, B) => xt.map((t) => line(sx(slog(t)), T, sx(slog(t)), B, "#eeeeee")).join("") + line(sx(0), T, sx(0), B, "#666666"),
      marks: (sx, sy, ys) => d.map((x, i) => {
        const y0 = sy(ys[i] + 0.36), y1 = sy(ys[i] - 0.36), v = vs[i];
        const x0 = sx(Math.min(0, v)), x1 = sx(Math.max(0, v));
        const c = x.v >= 0 ? GOOD_COL : BAD_COL;
        const tip = `${x.r.title}: ${x.v > 0 ? "net " + n0(x.v) + " lives saved a year" : x.v < 0 ? "net " + n0(x.v) + " deaths a year" : "no change"} (${n0(x.saved)} saved, ${n0(x.dead)} caused)`;
        const lv = x.v === 0 ? "0" : narrow ? short(x.v) : n0(x.v);
        const right = x.v >= 0;
        return `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(Math.max(x.v === 0 ? 0 : 1, x1 - x0))}" height="${f1(y1 - y0)}" fill="${c}"><title>${esc(tip)}</title></rect>` +
          txt(right ? x1 + 3 : x0 - 3, sy(ys[i]), lv, { size: narrow ? 8.5 : 9.5, base: "central", anchor: right ? "start" : "end", fill: "#4d4d4d" });
      }).join(""),
    });
  }

  // ---- Rendering per tab ----------------------------------------------------------------------
  const setText = (id, s) => { document.getElementById(id).textContent = s; };
  const setHTML = (id, s) => { document.getElementById(id).innerHTML = s; };

  function renderRanking() {
    const r = shown;
    setText("vb_top", r.length ? r[0].title : "—");
    setText("vb_n", r.length ? `#${PUB_RANK.get(r[0].id)} of ${DATA.policies.length}` : "—");
    const F = budgetFigures();
    drawBudget(document.getElementById("budget_top"), NET_COLS, true, 280, F, { symmetric: true });
    drawRankPlot();
    drawXY();
    setText("hl_aid", `$${ODA[2025].toFixed(1)} billion`);
    setHTML("tierkey", tierKey());
  }

  function renderUncertainty() {
    const r = shown, nAll = res.length;
    setHTML("unc_tierkey", tierKey());
    rowChart(document.getElementById("unc_plot"), {
      labels: r.map(labOf), height: rowH(r.length) + 40, top: 40, bottom: 44, right: 14,
      xlim: [1, nAll], xticks: [1, 10, 20, 30, 40, 50, nAll].filter((v, i, a) => v <= nAll && a.indexOf(v) === i),
      xtickLabels: [1, 10, 20, 30, 40, 50, nAll].filter((v, i, a) => v <= nAll && a.indexOf(v) === i).map(String),
      xlab: "Rank across 1,000 re-runs (1 = best)", endL: "Top ranked", endR: "Bottom ranked",
      grid: (sx, T, B) => [1, 10, 20, 30, 40, 50].filter((v) => v <= sx.hi).map((v) => line(sx(v), T, sx(v), B, "#eeeeee")).join(""),
      marks: (sx, sy, ys) => r.map((x, i) => {
        const c = tierCol(x);
        return line(sx(x.rank_lo), sy(ys[i]), sx(x.rank_hi), sy(ys[i]), c, { w: 6, op: 0.5, cap: "butt" }) +
          circle(sx(x.rank_med), sy(ys[i]), 3.6, c, { title: `${x.title}: typical rank ${x.rank_med}, 90% of runs between ${x.rank_lo} and ${x.rank_hi}` });
      }).join(""),
    });
    rowChart(document.getElementById("ptop_plot"), {
      labels: r.map(labOf), height: rowH(r.length) + 40, top: 40, bottom: 44, right: 30,
      xlim: [0, 1.08], xticks: [0, 0.25, 0.5, 0.75, 1], xtickLabels: ["0%", "25%", "50%", "75%", "100%"],
      xlab: "Chance of finishing in the top 20", endL: "Inconsistent", endR: "Consistent",
      grid: (sx, T, B) => [0, 0.25, 0.5, 0.75, 1].map((v) => line(sx(v), T, sx(v), B, "#eeeeee")).join(""),
      marks: (sx, sy, ys) => r.map((x, i) => {
        const y0 = sy(ys[i] + 0.36), y1 = sy(ys[i] - 0.36);
        return rect(sx(0), y0, sx(x.p_top) - sx(0), y1 - y0, GRADE_COLS[x.grade]) +
          txt(sx(x.p_top + 0.01), sy(ys[i]), fmtPct(x.p_top), { size: 9.5, base: "central", fill: "#4d4d4d" });
      }).join(""),
    });
    setHTML("rank_table", rankTable());
  }

  function renderBudget() {
    const F = budgetFigures();
    const port = BCA.portfolio(shown, state.minbcr);
    setText("vb_spent", fmtBn(F.bestSpend));
    setText("vb_benefit", money(F.bestNet));
    setText("vb_wspent", money(F.worstNet));
    setText("vb_wbenefit", money(F.worstFullNet));
    const z = port.filter((x) => x.cost_used === 0);
    setText("netnote", `Net value = today's value of all the future benefits the money buys (spending × ratio), minus the spending. ${z.length === 1 ? `1 reform above the threshold costs nothing (${z[0].short}), so its gains come` : `${z.length} reforms above the threshold cost nothing${z.length ? ` (including ${z.slice(0, 3).map((x) => x.short).join(", ")})` : ""}, so their gains come`} on top of the blue total for free.`);
    setText("fit_note", `Best buys funded from the $${AVAIL_YR.toFixed(1)}B aid budget (ratio above ${state.minbcr}): ${F.best.length ? F.best.map((x) => x.short).join(", ") : "none fit"}.`);
    drawBudget(document.getElementById("budget_plot"), NET_COLS, false, 400, F);
    setText("port_head", `Funded: ${port.length} policies with an adjusted ratio above ${state.minbcr}`);
    setHTML("port_table", port.length ? budgetTable(port) : "<p>No policy clears that threshold.</p>");
    setHTML("worst_table", budgetTable(BCA.worstN(res, 10)));
  }


  // Minimal Markdown for the policy essays: paragraphs, lists, bold, italics, links.
  function mdLite(t) {
    if (isBlank(t)) return "";
    const inline = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/(https?:\/\/[^\s<)]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
    // Within each blank-line-separated block, runs of consecutive "- " (or "* ") lines become <ul>
    // and runs of "1. " lines become <ol>; any other lines become a paragraph.
    const UL = /^\s*[-*] /, OL = /^\s*\d+\. /;
    const kind = (l) => (UL.test(l) ? "ul" : OL.test(l) ? "ol" : "p");
    return String(t).split(/\n\s*\n/).map((blk) => {
      const lines = blk.split("\n").filter((l) => l.trim());
      const runs = [];
      lines.forEach((l) => {
        const k = kind(l), last = runs[runs.length - 1];
        if (last && last.k === k) last.ls.push(l); else runs.push({ k, ls: [l] });
      });
      return runs.map((r) => r.k === "p" ? `<p>${r.ls.map(inline).join("<br>")}</p>`
        : `<${r.k}>` + r.ls.map((l) => `<li>${inline(l.replace(r.k === "ul" ? UL : OL, ""))}</li>`).join("") + `</${r.k}>`).join("");
    }).join("");
  }
  const ESSAY_SECTIONS = [["policy", "The policy"], ["why_on_list", "Why it is on the list"], ["evidence", "Results"], ["ratio", "How the ratio is built"], ["cost", "Full cost"], ["strength", "Strength of evidence"], ["difficulty", "Difficulty"], ["who_benefits", "Who benefits"], ["counter", "Counter-evidence and what would change the verdict"]];
  function essayBlock(id, p0, adjTxt) {
    const e = (DATA.essays || {})[String(id)];
    if (!e) return `<details class='sub' open><summary>Summary</summary><p>${esc(p0.summary)}</p>${adjTxt}</details>`;
    const sec = ESSAY_SECTIONS.map(([k, h]) => isBlank(e[k]) ? "" :
      `<details class='sub essay'${k === "evidence" ? " open" : ""}><summary>${h}</summary><div class='essay-body'>${mdLite(e[k])}</div></details>`).join("");
    return `<div class='essay-result'>${adjTxt}</div>` + sec;
  }

  // "How the 40 policies were chosen": the ten policies of each group, from data.json
  const GROUP_LABEL = { Freedom: "Economic freedom" };
  const GROUP_NOTE = {
    Health: "The top-ranked health investments in previous benefit-cost research (Copenhagen Consensus, Disease Control Priorities, WHO, GiveWell).",
    Climate: "The most-discussed climate policies: those with the most support in large climate surveys, and proposals put forward by governments and international bodies.",
    Freedom: "Widely proposed reforms that remove rules, subsidies or barriers, drawn from the areas of the Fraser Institute's Economic Freedom of the World index.",
    Popular: "Policies with wide public support in recent polls, most of them backed by a majority.",
  };
  const groupClass = (c) => "g-" + String(c).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  function renderSelection() {
    const html = CATS.map((c) => {
      const rows = res.filter((r) => r.category === c);
      const items = rows.map((r) => {
        const p0 = POL_BY_ID.get(r.id);
        // Selection note: who or what list put the policy here (falls back to the method; both optional in data.json)
        const selNote = !isBlank(p0.selected_by) ? p0.selected_by : (!isBlank(p0.selection_method) ? p0.selection_method : "");
        const sb = selNote ? `<span class="sb">${esc(selNote)}</span>` : "";
        const tip = [p0.title, p0.selection_method].filter((x) => !isBlank(x)).join(" · ");
        return `<li><button type="button" class="selp" data-id="${r.id}" title="${esc(tip)}"><span class="rk">#${r.rank}</span>` +
          `<span class="tt">${esc(p0.short || p0.title)}</span>${tierBadge(tierOf(r.bcr_median))}${sb}</button></li>`;
      }).join("");
      const note = GROUP_NOTE[c] ? `<span>${esc(GROUP_NOTE[c])}</span>` : "";
      return `<div class="selcol ${groupClass(c)}"><div class="selhd"><b>${esc(GROUP_LABEL[c] || c)} (${rows.length})</b>${note}</div><ul class="sellist">${items}</ul></div>`;
    }).join("");
    setHTML("selgrid", html);
  }
  function openPolicy(id) {
    const d = document.querySelector(`#explorer details.pol[data-id="${id}"]`);
    if (!d) return;
    d.open = true;
    d.classList.remove("flash"); void d.offsetWidth; d.classList.add("flash");
    d.scrollIntoView({ behavior: "smooth", block: "start" });
    d.querySelector("summary").focus({ preventScroll: true });
  }

  function renderExplorer() {
    renderSelection();
    const host = document.getElementById("explorer");
    const open = new Set([...host.querySelectorAll("details.pol[open]")].map((d) => d.dataset.id));
    const items = res.map((rr) => {
      const p0 = POL_BY_ID.get(rr.id);
      const all = SRC_BY_POL.get(rr.id) || [];
      const s = all.filter((x) => x.role === "evidence");
      const cs = all.filter((x) => x.role === "counterpoint");
      const csItems = !cs.length ? "" : `<details class='sub'><summary>Counter-evidence, not used in the range (${cs.length})</summary><ol>` +
        cs.map((c) => `<li class='srcli'>${esc(c.authors)} (${esc(yearOf(c.year))}). ${esc(c.title)}. <em>${esc(c.venue)}</em>.${srcLink(c.url, c.doi)}<br><span class='meta'>Why it is not used: ${esc(c.why_excluded)}</span></li>`).join("") +
        "</ol></details>";
      const rangeTxt = p0.rated ? `published ratio ${fmtBcr(p0.bcr_low)} – ${fmtBcr(p0.bcr_high)}` : "not rated yet";
      const adjTxt = `<div class='kv'><b>Adjusted ratio</b><br>${fmtBcr(rr.bcr_median)} (90% range ${fmtBcr(rr.bcr_q05)} – ${fmtBcr(rr.bcr_q95)}) at your current settings; chance of top 20: ${fmtPct(rr.p_top)}</div>`;
      const sSorted = s.slice().sort((a, b) => String(a.authors || a.title).localeCompare(String(b.authors || b.title)));
      const srcItems = !sSorted.length ? "<p>No sources.</p>" : sSorted.map((x) => `<li class='srcli'>${esc(x.authors)} (${esc(yearOf(x.year))}). ${esc(x.title)}. <em>${esc(x.venue)}</em>. <span class='meta'>[${esc(TYPE_LABEL[x.type] || x.type)}]</span>` +
        `${isBlank(x.reported_estimate) ? "" : `<br><span class='meta'>Reports: ${esc(x.reported_estimate)}</span>`}${srcLink(x.url, x.doi)}</li>`).join("");
      return `<details class='pol' data-id='${rr.id}'${open.has(String(rr.id)) ? " open" : ""}><summary>#${rr.rank} · ${esc(p0.title)} <span class='meta'>· ${esc(p0.category)} · ${badge(p0.grade)} · ${rangeTxt}</span></summary><div class='polbody'>` +
        essayBlock(rr.id, p0, adjTxt) +
        `<details class='sub'><summary>References (${s.length})</summary><ol>${srcItems}</ol></details>${csItems}</div></details>`;
    });
    host.innerHTML = items.join("\n");
  }

  function renderDeaths() {
    const rows = deathsRows();
    drawDeaths(document.getElementById("deaths_plot"), rows);
    setHTML("deaths_table", deathsTable(rows));
  }

  // Tabs whose content never changes
  function renderStatic() {
    setHTML("rubric", RUBRIC.map(([g, t]) => `<li>${badge(g)} ${esc(t)}</li>`).join(""));
    setHTML("gkey", `<div class="gkey"><div class="gkey-t">Colour = evidence grade: how strong the published evidence behind each number is</div>` +
      `<div class="gkey-row"><span class="gkey-end">Strongest</span>${GRADES.map(badge).join(" ")}<span class="gkey-end">Weakest</span></div>` +
      `<div class="gkey-s"><b>A</b> grades = peer-reviewed benefit-cost studies, the best with randomized or controlled trials &nbsp;·&nbsp; <b>B</b> grades = natural experiments, published economic models and official estimates &nbsp;·&nbsp; <b>C</b> grades = think-tank studies and theory, down to C−: never tried at scale. Full rubric on the Uncertainty tab.</div></div>`);
    setText("vb_src", comma(String(N_WORKS)));
    renderSources();
    setText("oda_big", `$${ODA[2025].toFixed(1)} billion`);
    setHTML("oda_years", `<div><b>$${ODA[2023].toFixed(1)}B</b>2023</div><div><b>$${ODA[2024].toFixed(1)}B</b>2024</div>` +
      `<div class="cur"><b>$${ODA[2025].toFixed(1)}B</b>2025</div><div><b>~$${ODA[2026].toFixed(0)}B</b>2026 est.</div>`);
    const mx = Math.log10(Math.max(...CONTEXT.map((c) => c[1])));
    const rows = CONTEXT.map(([what, bn, src, url]) => `<tr><td>${esc(what)}<div class="small-src"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(src)}</a></div></td><td class="num">${fmtBn(bn)}</td><td class="barcell"><div class="bar" style="width:${(100 * Math.log10(bn) / mx).toFixed(0)}%"></div></td></tr>`);
    rows.push(`<tr class="hl"><td><b>Development aid budget (headline)</b><div class="small-src">OECD, preliminary 2025 data</div></td><td class="num"><b>${fmtBn(AVAIL_YR)}</b></td><td class="barcell"><div class="bar hlbar" style="width:${(100 * Math.log10(AVAIL_YR) / mx).toFixed(0)}%"></div></td></tr>`);
    setHTML("context", tableWrap('<th>Budget</th><th class="num">Per year</th><th>Size (log scale)</th>', rows));
  }

  function renderSources() {
    const seen = new Set(), u = [];
    for (const s of DATA.sources) {
      const k = (s.title + " " + (isBlank(s.year) ? "NA" : s.year)).toLowerCase();
      if (!seen.has(k)) { seen.add(k); u.push(s); }
    }
    const keyed = u.map((s, i) => ({ s, i, k: (isBlank(s.authors) ? s.title : s.authors).toLowerCase().replace(/[^a-z0-9 ]/g, "") }));
    keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i));
    const lines = keyed.map(({ s }) => `<p class="bib">${esc(s.authors)} (${esc(yearOf(s.year))}). ${esc(s.title)}. <em>${esc(s.venue)}</em>.${srcLink(s.url, s.doi)}</p>`);
    setHTML("bib", `<p class="lead-sm">${u.length} unique works cited across the 40 policies, in alphabetical order.</p>` + lines.join("\n"));
  }

  // The full sources list sits under the Policy explorer (card #sources); it is rendered once in renderStatic.
  const RENDER = { ranking: renderRanking, uncertainty: renderUncertainty, budget: renderBudget, explorer: renderExplorer, deaths: renderDeaths, methodology: () => {} };

  function renderTab(tab) {
    if (!dirty.has(tab)) return;
    RENDER[tab]();
    dirty.delete(tab);
  }
  function invalidate(tabs) {
    tabs.forEach((t) => dirty.add(t));
    renderTab(currentTab);
  }
  const DYNAMIC = ["ranking", "uncertainty", "budget", "explorer", "deaths"];

  // ---- Tabs ----------------------------------------------------------------------------------
  function showTab(tab, push) {
    // In-page anchors: #glossary is on Methodology; #sources (the old All sources tab) is under the Policy explorer
    const anchor = tab === "glossary" || tab === "sources" ? tab : null;
    if (anchor) tab = tab === "sources" ? "explorer" : "methodology";
    if (!RENDER[tab]) tab = "ranking";
    currentTab = tab;
    document.querySelectorAll(".nav-link").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
    const hash = "#" + (anchor || tab);
    if (push && location.hash !== hash) history.replaceState(null, "", hash);
    renderTab(tab);
    if (anchor) document.getElementById(anchor).scrollIntoView({ block: "start" });
  }

  // ---- Controls -------------------------------------------------------------------------------
  const sliders = {};
  function buildSlider(host) {
    const id = host.dataset.slider;
    const min = Number(host.dataset.min), max = Number(host.dataset.max), step = Number(host.dataset.step);
    const value = Number(host.dataset.value);
    const wrap = document.createElement("div");
    let html = `<label class="lab" for="in-${id}">${host.dataset.label}</label><div class="sl"><span class="mm mn">${min}</span><span class="mm mx">${max}</span><span class="bubble"></span>` +
      `<input type="range" id="in-${id}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
    if (host.dataset.grid) {
      html += '<div class="grid">' + [0, 0.25, 0.5, 0.75, 1].map((f) => `<span style="left:${f * 100}%">${trimNum(min + f * (max - min))}</span>`).join("") + "</div>";
    }
    if (host.dataset.left) html += `<div class="ends"><span>${host.dataset.left}</span><span>${host.dataset.right}</span></div>`;
    wrap.innerHTML = html;
    host.prepend(...wrap.childNodes);
    const input = host.querySelector("input");
    const bubble = host.querySelector(".bubble");
    const mins = host.querySelectorAll(".mm");
    const paint = () => {
      const v = Number(input.value);
      const f = (v - min) / (max - min);
      input.style.setProperty("--pct", f * 100 + "%");
      bubble.textContent = trimNum(v);
      bubble.style.left = `calc(${f * 100}% + ${(0.5 - f) * 18}px)`;
      mins[0].style.visibility = f < 0.12 ? "hidden" : "visible";
      mins[1].style.visibility = f > 0.88 ? "hidden" : "visible";
    };
    paint();
    sliders[id] = { input, paint };
    let queued = false;
    input.addEventListener("input", () => {
      paint();
      state[id] = Number(input.value);
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (id === "minbcr") invalidate(["ranking", "budget"]);
        else { compute(); invalidate(DYNAMIC); }
      });
    });
  }

  function buildFilters() {
    const mk = (hostId, values, set, labelOf) => {
      const host = document.getElementById(hostId);
      host.innerHTML = values.map((v) => `<label><input type="checkbox" value="${esc(v)}" checked> ${labelOf(v)}</label>`).join("");
      host.addEventListener("change", (e) => {
        if (e.target.checked) set().add(e.target.value); else set().delete(e.target.value);
        applyFilters();
        invalidate(["ranking", "uncertainty", "budget"]);
      });
    };
    mk("f-cats", CATS, () => state.cats, esc);
  }

  function reset() {
    Object.assign(state, OPT_DEFAULTS);
    Object.entries(DEFAULTS).forEach(([k, v]) => { state[k] = v; sliders[k].input.value = v; sliders[k].paint(); });
    state.cats = new Set(CATS);
    document.querySelectorAll(".chips input").forEach((c) => { c.checked = true; });
    compute();
    invalidate(DYNAMIC);
  }

  // ---- Start-up ----------------------------------------------------------------------------------
  async function init() {
    const resp = await fetch("data.json?v=202610151320");
    if (!resp.ok) throw new Error("Could not load data.json (" + resp.status + ")");
    DATA = await resp.json();
    MODEL = BCA.createModel(DATA.policies, DATA.draws);
    POL_BY_ID = new Map(MODEL.all.map((p) => [p.id, p]));
    SRC_BY_POL = new Map();
    DATA.sources.forEach((s) => {
      const id = Number(s.policy_id);
      if (!SRC_BY_POL.has(id)) SRC_BY_POL.set(id, []);
      SRC_BY_POL.get(id).push(s);
    });
    N_WORKS = new Set(DATA.sources.map((s) => (s.title + " " + (isBlank(s.year) ? "NA" : s.year)).toLowerCase())).size;
    CATS = [...new Set(MODEL.all.map((p) => p.category))].sort();
    state.cats = new Set(CATS);
    PUB_RANK = new Map(BCA.runBca(MODEL, {}).map((r) => [r.id, r.rank]));

    document.querySelectorAll("[data-slider]").forEach(buildSlider);
    buildFilters();
    document.getElementById("reset").addEventListener("click", reset);
    document.querySelectorAll(".nav-link").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      showTab(a.dataset.tab, true);
      window.scrollTo(0, 0);
    }));
    document.getElementById("glossary_link").addEventListener("click", (e) => { e.preventDefault(); showTab("glossary", true); });
    document.getElementById("selgrid").addEventListener("click", (e) => {
      const b = e.target.closest(".selp");
      if (b) openPolicy(b.dataset.id);
    });
    document.querySelector(".navbar-brand").addEventListener("click", (e) => { e.preventDefault(); showTab("ranking", true); });
    window.addEventListener("hashchange", () => showTab(location.hash.slice(1), false));

    let lastW = window.innerWidth, rt = 0;
    window.addEventListener("resize", () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(rt);
      rt = setTimeout(() => invalidate(["ranking", "uncertainty", "budget", "deaths"]), 150);
    });

    renderStatic();
    compute();
    DYNAMIC.forEach((t) => dirty.add(t));
    showTab(location.hash.slice(1) || "ranking", false);
    document.documentElement.dataset.ready = "1";
  }

  init().catch((err) => {
    const el = document.getElementById("rank_plot");
    if (el) el.innerHTML = `<div class="empty">The dashboard could not start: ${esc(err.message)}</div>`;
    throw err;
  });
})();
