/* Health Pyramid — hand-drawn diagram (rough.js) pyramid + evidence explorer. */
(function () {
  "use strict";
  var DATA = window.HP_DATA || [];
  var BY = {}; DATA.forEach(function (d) { BY[d.id] = d; });
  var NS = "http://www.w3.org/2000/svg";
  var TIER = { daily: "#5b8def", weekly: "#f2c46d", monthly: "#76bf94", annual: "#e07a7a" };
  var INK = "#1a1a1a";
  var rc, SEED = 7;
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function o(extra) { var b = { roughness: 1.3, bowing: 1.4, stroke: INK, strokeWidth: 3, seed: SEED++ }; for (var k in extra) b[k] = extra[k]; return b; }
  function put(g, node) { g.appendChild(node); return node; }

  // geometry
  var A = [540, 70], L = [70, 940], R = [1010, 940], D = [58, -30];
  var CX = A[0];
  function hw(y) { return (R[0] - A[0]) * (y - A[1]) / (L[1] - A[1]); }
  var CUTS = [245, 382, 570];
  var LAYOUT = {
    annual: { rows: [[190, ["bloodtest"]]], label: [230, "ANNUAL", 20] },
    monthly: { rows: [[318, ["run10k"]]], label: [362, "MONTHLY", 26] },
    weekly: { rows: [[422, ["legs", "armsback", "fullbody"]], [462, ["run5k", "fish"]], [502, ["redmeat", "organ"]]], label: [550, "WEEKLY", 28] },
    daily: { rows: [[618, ["steps", "sauna", "wimhof"]], [660, ["dailydozen", "acv"]], [754, ["creatine", "collagen", "omega3", "prebiotic", "protein"]], [798, ["adaptogens", "carotenoids"]], [842, ["vitamink", "multivitamin", "caakg", "taurine_glycine"]]], label: [910, "DAILY", 34] }
  };

  function drawPyramid(svg) {
    rc = rough.svg(svg);
    var back = el("g", {}, svg), ink = el("g", {}, svg), mid = el("g", {}, svg);
    var A2 = [A[0] + D[0], A[1] + D[1]], R2 = [R[0] + D[0], R[1] + D[1]];
    el("path", { d: "M" + A + " L" + R + " L" + L + " Z", fill: "#fff" }, back);
    // side face: dot-work shading, one colour per tier
    [[A[1], CUTS[0], "annual"], [CUTS[0], CUTS[1], "monthly"], [CUTS[1], CUTS[2], "weekly"], [CUTS[2], L[1], "daily"]].forEach(function (b) {
      var x0 = CX + hw(b[0]), x1 = CX + hw(b[1]);
      put(back, rc.polygon([[x0, b[0]], [x0 + D[0], b[0] + D[1]], [x1 + D[0], b[1] + D[1]], [x1, b[1]]],
        o({ stroke: "none", fill: TIER[b[2]], fillStyle: "dots", fillWeight: 2.6, hachureGap: 11, roughness: 0.8 })));
    });
    // outline + extrusion
    put(ink, rc.polygon([A, R, L], o({ strokeWidth: 3.4 })));
    put(ink, rc.linearPath([A, A2, R2, R], o({ strokeWidth: 3.2 })));
    // tier dividers, wrapping round the side like a ledge
    CUTS.forEach(function (y) {
      var h = hw(y);
      put(ink, rc.line(CX - h, y, CX + h, y, o({ strokeWidth: 2.8 })));
      put(ink, rc.line(CX + h, y, CX + h + D[0], y + D[1], o({ strokeWidth: 2.4 })));
    });
    // tier labels with a colour swash behind them
    Object.keys(LAYOUT).forEach(function (t) {
      var lb = LAYOUT[t].label, w = lb[1].length * lb[2] * 0.48;
      put(mid, rc.rectangle(CX - w, lb[0] - lb[2] * 0.62, w * 2, lb[2] * 0.72, o({ stroke: "none", fill: TIER[t], fillStyle: "zigzag", fillWeight: 3.5, hachureGap: 5, roughness: 1.2 })));
      var tx = el("text", { x: CX, y: lb[0], "text-anchor": "middle", class: "tl", style: "font-size:" + lb[2] + "px" }, mid);
      tx.textContent = lb[1];
    });
    // Blueprint header + dashed sketch frame
    var bh = el("text", { x: CX, y: 707, "text-anchor": "middle", class: "bjh" }, mid);
    bh.textContent = "Bryan Johnson's Blueprint stack";
    var top = 684, bot = 862;
    put(ink, rc.polygon([[CX - hw(top) + 24, top], [CX + hw(top) - 24, top], [CX + hw(bot) - 32, bot], [CX - hw(bot) + 32, bot]],
      o({ strokeWidth: 1.8, strokeLineDash: [8, 8], roughness: 1, stroke: "#555", disableMultiStroke: true })));
    return { items: el("g", {}, svg) };
  }

  function drawItems(g) {
    Object.keys(LAYOUT).forEach(function (tier) {
      LAYOUT[tier].rows.forEach(function (row) {
        var y = row[0], ids = row[1], nodes = [], gap = 30, total = 0;
        ids.forEach(function (id) {
          var d = BY[id]; if (!d) return;
          var a = el("g", { class: "it", tabindex: 0, role: "link", "aria-label": d.title + " — open evidence" }, g);
          var mk = el("g", { class: "mk" }, a);
          var t = el("text", { x: 0, y: y }, a); t.textContent = d.label;
          var w = (t.getComputedTextLength && t.getComputedTextLength()) || d.label.length * 10;
          nodes.push({ a: a, t: t, mk: mk, w: w, id: id }); total += w;
        });
        total += gap * (nodes.length - 1);
        var x = CX - total / 2;
        nodes.forEach(function (n) {
          n.t.setAttribute("x", x.toFixed(1));
          n.mk.appendChild(rc.rectangle(x - 8, y - 22, n.w + 16, 31, o({ stroke: "none", fill: TIER[tier], fillStyle: "solid", roughness: 1.5 })));
          var ul = put(n.a, rc.line(x, y + 8, x + n.w, y + 7, o({ stroke: TIER[tier], strokeWidth: 3, roughness: 1.4 })));
          ul.setAttribute("class", "ul");
          var go = function () { openItem(n.id); };
          n.a.addEventListener("click", go);
          n.a.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
          x += n.w + gap;
        });
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
  function itemHtml(d) {
    return '<details class="pol" id="hp-' + d.id + '"><summary>' + esc(d.title) + ' <span class="meta">· 3 sources</span></summary><div class="polbody"><p class="blurb">' + esc(d.blurb) + "</p>" + d.sources.map(srcHtml).join("") + "</div></details>";
  }

  function drawExplorer(host) {
    var tiers = [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["annual", "Annual"]];
    var html = "";
    tiers.forEach(function (t) {
      var list = DATA.filter(function (d) { return d.tier === t[0]; });
      var core = list.filter(function (d) { return !d.group; }), bj = list.filter(function (d) { return d.group === "bj"; });
      html += '<section class="tier ' + t[0] + '"><h3>' + t[1] + "<small>" + list.length + " item" + (list.length > 1 ? "s" : "") + "</small></h3>" + core.map(itemHtml).join("");
      if (bj.length) html += '<div class="grp">Bryan Johnson\'s Blueprint stack</div><p class="grpnote">The supplements from Bryan Johnson\'s published daily protocol (protocol.bryanjohnson.com). His prescription drugs are left off: those are for a doctor to decide.</p>' + bj.map(itemHtml).join("");
      html += "</section>";
    });
    host.innerHTML = html;
  }

  function init() {
    var svg = document.getElementById("hp-svg"), ex = document.getElementById("hp-explorer");
    if (!svg || !ex || !window.rough) return;
    drawExplorer(ex);
    var layers = drawPyramid(svg);
    drawItems(layers.items);
    document.getElementById("hp-open").addEventListener("click", function () { ex.querySelectorAll("details.pol").forEach(function (d) { d.open = true; }); });
    document.getElementById("hp-close").addEventListener("click", function () { ex.querySelectorAll("details.pol").forEach(function (d) { d.open = false; }); });
    var h = location.hash.replace("#hp-", ""); if (BY[h]) setTimeout(function () { openItem(h); }, 300);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
