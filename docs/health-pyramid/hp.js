/* Health Pyramid — hand-drawn diagram (rough.js) pyramid + evidence explorer. */
(function () {
  "use strict";
  var DATA = window.HP_DATA || [];
  var BY = {}; DATA.forEach(function (d) { BY[d.id] = d; });
  var NS = "http://www.w3.org/2000/svg";
  var TIER = { supplements: "#a98bd6", daily: "#5b8def", weekly: "#f2c46d", monthly: "#76bf94", annual: "#e07a7a" };
  var INK = "#1a1a1a";
  var rc, SEED = 7;
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function o(extra) { var b = { roughness: 1.3, bowing: 1.4, stroke: INK, strokeWidth: 3, seed: SEED++ }; for (var k in extra) b[k] = extra[k]; return b; }
  function put(g, node) { g.appendChild(node); return node; }

  // geometry: apex fixed, slope fixed, height grows with the content
  var W = 1100, CX = 520, AY = 50, SLOPE = 0.6, PAD = 34, ROW = 40, GAP = 24;
  function hw(y) { return SLOPE * (y - AY); }
  var TIERS = ["annual", "monthly", "weekly", "daily", "supplements"];
  var LABEL = { annual: "ANNUAL", monthly: "MONTHLY", weekly: "WEEKLY", daily: "DAILY", supplements: "SUPPLEMENTS" };
  var LSIZE = { annual: 20, monthly: 26, weekly: 30, daily: 34, supplements: 34 };

  // greedy wrap of measured chips into rows that fit the pyramid at each height
  function layout(meas) {
    var y = AY, rows = [], cuts = [], labels = [], heads = [];
    TIERS.forEach(function (t, ti) {
      var groups = [DATA.filter(function (d) { return d.tier === t && !d.group; }), DATA.filter(function (d) { return d.tier === t && d.group === "supp"; })];
      y += ti === 0 ? 118 : 46;
      groups.forEach(function (list, gi) {
        if (!list.length) return;
        if (gi === 1) { y += 12; heads.push({ y: y, text: "Supplements" }); y += ROW - 6; }
        var i = 0;
        while (i < list.length) {
          var avail = 2 * hw(y - 22) - 2 * PAD, row = [], w = 0;
          while (i < list.length) {
            var add = meas[list[i].id] + (row.length ? GAP : 0);
            if (row.length && w + add > avail) break;
            row.push(list[i]); w += add; i++;
          }
          rows.push({ y: y, tier: t, items: row, w: w });
          y += ROW;
        }
      });
      y += 8 + LSIZE[t] * 0.4;
      labels.push({ y: y, tier: t });
      y += 22;
      cuts.push(y);
    });
    return { rows: rows, cuts: cuts.slice(0, -1), base: cuts[cuts.length - 1], labels: labels, heads: heads };
  }

  function draw(svg) {
    rc = rough.svg(svg);
    // measure every chip label once
    var probe = el("g", { class: "it", visibility: "hidden" }, svg), meas = {};
    DATA.forEach(function (d) { var t = el("text", { x: 0, y: 0 }, probe); t.textContent = d.label; meas[d.id] = t.getComputedTextLength() || d.label.length * 10; });
    svg.removeChild(probe);
    var Lo = layout(meas), base = Lo.base, D = [54, -28];
    CX = hw(base) + 12; W = 2 * hw(base) + 24 + D[0] + 12;
    CX = hw(base) + 12; W = 2 * hw(base) + 24 + D[0] + 12;
    var A = [CX, AY], L = [CX - hw(base), base], R = [CX + hw(base), base];
    svg.setAttribute("viewBox", "0 " + (AY + D[1] - 10) + " " + Math.ceil(W) + " " + Math.ceil(base + 20 - AY - D[1]));
    var back = el("g", {}, svg), ink = el("g", {}, svg), mid = el("g", {}, svg), items = el("g", {}, svg);
    el("path", { d: "M" + A + " L" + R + " L" + L + " Z", fill: "#fff" }, back);
    var A2 = [A[0] + D[0], A[1] + D[1]], R2 = [R[0] + D[0], R[1] + D[1]];
    put(ink, rc.polygon([A, R, L], o({ strokeWidth: 3.4 })));
    put(ink, rc.linearPath([A, A2, R2, R], o({ strokeWidth: 3.2 })));
    Lo.cuts.forEach(function (y) {
      var h = hw(y);
      put(ink, rc.line(CX - h, y, CX + h, y, o({ strokeWidth: 2.8 })));
      put(ink, rc.line(CX + h, y, CX + h + D[0], y + D[1], o({ strokeWidth: 2.4 })));
    });
    Lo.labels.forEach(function (lb) {
      var tx = el("text", { x: CX, y: lb.y, "text-anchor": "middle", class: "tl", style: "font-size:" + LSIZE[lb.tier] + "px" }, mid);
      tx.textContent = LABEL[lb.tier];
    });
    Lo.heads.forEach(function (h) { var t = el("text", { x: CX, y: h.y, "text-anchor": "middle", class: "bjh" }, mid); t.textContent = h.text; });
    Lo.rows.forEach(function (row) {
      var x = CX - row.w / 2, y = row.y;
      row.items.forEach(function (d) {
        var w = meas[d.id];
        var a = el("g", { class: "it", tabindex: 0, role: "link", "aria-label": d.title + " — open evidence" }, items);
        var mk = el("g", { class: "mk" }, a);
        mk.appendChild(rc.rectangle(x - 7, y - 20, w + 14, 28, o({ stroke: "none", fill: "#e9e9e9", fillStyle: "solid", roughness: 1.4 })));
        var t = el("text", { x: x.toFixed(1), y: y }, a); t.textContent = d.label;
        put(a, rc.line(x, y + 7, x + w, y + 6, o({ stroke: TIER[row.tier], strokeWidth: 2.8, roughness: 1.4 }))).setAttribute("class", "ul");
        var go = function () { openItem(d.id); };
        a.addEventListener("click", go);
        a.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        x += w + GAP;
      });
    });
  }

  function openItem(id) {
    var d = document.getElementById("hp-" + id); if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: "smooth", block: "start" });
    d.classList.remove("flash"); void d.offsetWidth; d.classList.add("flash");
    if (history.replaceState) history.replaceState(null, "", "#hp-" + id);
  }

  var BADGE = { "meta-analysis": "#1f4e9c", "systematic review": "#4a80cc", "RCT": "#4f9d69", "cohort": "#b8850d", "guideline": "#5d7189", "review": "#8a94a3", "animal study": "#a61c1c" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function srcHtml(s) {
    var url = s.url || (s.doi ? "https://doi.org/" + s.doi : "#");
    var bits = [esc(s.authors), esc(s.journal), esc(s.year)];
    if (s.doi) bits.push('DOI <a href="https://doi.org/' + esc(s.doi) + '" target="_blank" rel="noopener">' + esc(s.doi) + "</a>");
    return '<div class="src"><div class="st"><span class="badge" style="background:' + (BADGE[s.type] || "#8a94a3") + '">' + esc(s.type) + '</span><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a></div>" +
      '<div class="sm">' + bits.join(" · ") + "</div><p>" + esc(s.summary) + "</p>" +
      (s.highlight ? '<blockquote>Highlighted: <mark>“' + esc(s.highlight) + '”</mark></blockquote>' : "") + "</div>";
  }
  function markersHtml(d) {
    if (!d.markers) return "";
    return '<div class="markers"><div class="mh">Markers to check</div><dl>' + d.markers.map(function (m) { return "<dt>" + esc(m[0]) + "</dt><dd>" + esc(m[1]) + "</dd>"; }).join("") + "</dl>" +
      (d.markers_src ? '<div class="ms">From: ' + d.markers_src.map(function (x) { return '<a href="' + esc(x[1]) + '" target="_blank" rel="noopener">' + esc(x[0]) + "</a>"; }).join(" · ") + "</div>" : "") + "</div>";
  }
  function itemHtml(d) {
    return '<details class="pol" id="hp-' + d.id + '"><summary>' + esc(d.title) + '</summary><div class="polbody"><p class="blurb">' + esc(d.blurb) + "</p>" + markersHtml(d) + d.sources.map(srcHtml).join("") + "</div></details>";
  }

  function drawExplorer(host) {
    var tiers = [["daily", "Daily"], ["supplements", "Supplements"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["annual", "Annual"]];
    var html = "";
    tiers.forEach(function (t) {
      var list = DATA.filter(function (d) { return d.tier === t[0]; });
      var core = list.filter(function (d) { return !d.group; }), bj = list.filter(function (d) { return d.group === "supp"; });
      html += '<section class="tier ' + t[0] + '"><h3>' + t[1] + "<small>" + list.length + " item" + (list.length > 1 ? "s" : "") + "</small></h3>" + (t[0] === "supplements" ? '<p class="grpnote">Bryan Johnson\'s published Blueprint supplements (protocol.bryanjohnson.com and the Blueprint product labels), plus my own additions. His prescription drugs are left off: those are for a doctor to decide.</p>' : "") + core.map(itemHtml).join("");
      if (bj.length) html += '<div class="grp">Supplements</div><p class="grpnote">Bryan Johnson\'s published Blueprint supplements (protocol.bryanjohnson.com and the Blueprint product labels), plus my own additions. His prescription drugs are left off: those are for a doctor to decide.</p>' + bj.map(itemHtml).join("");
      html += "</section>";
    });
    host.innerHTML = html;
  }

  function init() {
    var svg = document.getElementById("hp-svg"), ex = document.getElementById("hp-explorer");
    if (!svg || !ex || !window.rough) return;
    drawExplorer(ex);
    draw(svg);
    var nS = DATA.reduce(function (n, d) { return n + d.sources.length; }, 0), c = document.getElementById("hp-count");
    if (c) c.textContent = DATA.length + " items, " + nS + " sources.";
    document.getElementById("hp-open").addEventListener("click", function () { ex.querySelectorAll("details.pol").forEach(function (d) { d.open = true; }); });
    document.getElementById("hp-close").addEventListener("click", function () { ex.querySelectorAll("details.pol").forEach(function (d) { d.open = false; }); });
    var h = location.hash.replace("#hp-", ""); if (BY[h]) setTimeout(function () { openItem(h); }, 300);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
