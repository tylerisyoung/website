/* Health Pyramid — hand-drawn (seeded wobbly pen) SVG pyramid + evidence explorer. No dependencies. */
(function () {
  "use strict";
  var DATA = window.HP_DATA || [];
  var BY = {}; DATA.forEach(function (d) { BY[d.id] = d; });
  var NS = "http://www.w3.org/2000/svg";
  var TIER = { daily: "#5b8def", weekly: "#f2c46d", monthly: "#76bf94", annual: "#e07a7a" };
  var INK = "#151515";

  // seeded PRNG so the "sloppy" drawing is the same on every visit
  var seed = 20261017;
  function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  function j(a) { return (rnd() * 2 - 1) * a; }
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  // one wobbly pen stroke from p to q (slight overshoot, bowed middle)
  function stroke(x1, y1, x2, y2, wob) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    var w = wob == null ? Math.min(6, len * 0.012 + 1) : wob;
    var o1 = j(len * 0.012 + 1.5), o2 = j(len * 0.012 + 1.5);
    var sx = x1 - dx / len * o1 + j(1.5), sy = y1 - dy / len * o1 + j(1.5);
    var ex = x2 + dx / len * o2 + j(1.5), ey = y2 + dy / len * o2 + j(1.5);
    var b1 = j(w), b2 = j(w);
    var c1x = x1 + dx * 0.33 + nx * b1, c1y = y1 + dy * 0.33 + ny * b1;
    var c2x = x1 + dx * 0.66 + nx * b2, c2y = y1 + dy * 0.66 + ny * b2;
    return "M" + sx.toFixed(1) + " " + sy.toFixed(1) + " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) + " " + ex.toFixed(1) + " " + ey.toFixed(1);
  }
  // pen line: drawn twice, like going over it again with a pen
  function pen(g, x1, y1, x2, y2, o) {
    o = o || {};
    var d = stroke(x1, y1, x2, y2, o.wob) + " " + (o.single ? "" : stroke(x1, y1, x2, y2, o.wob));
    return el("path", { d: d, fill: "none", stroke: o.color || INK, "stroke-width": o.w || 2.6, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: o.op || 1 }, g);
  }
  function polyPen(g, pts, o) { for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; pen(g, a[0], a[1], b[0], b[1], o); } }
  // wobbly closed blob (for marker highlights)
  function blob(x, y, w, h) {
    var p = [[x + j(3), y + j(3)], [x + w + j(4), y + j(3)], [x + w + j(3), y + h + j(3)], [x + j(4), y + h + j(3)]];
    return "M" + p.map(function (q) { return q[0].toFixed(1) + " " + q[1].toFixed(1); }).join(" L") + " Z";
  }

  // geometry
  var A = [540, 60], L = [70, 940], R = [1010, 940], D = [62, -30];
  var CX = A[0];
  function hw(y) { return (R[0] - A[0]) * (y - A[1]) / (L[1] - A[1]); }
  var CUTS = [240, 380, 570]; // annual|monthly|weekly|daily dividers

  var LAYOUT = {
    annual: { rows: [[180, ["bloodtest"]]], label: [229, "ANNUAL", 25] },
    monthly: { rows: [[312, ["run10k"]]], label: [366, "MONTHLY", 40] },
    weekly: { rows: [[420, ["legs", "armsback", "fullbody"]], [460, ["run5k", "fish"]], [500, ["redmeat", "organ"]]], label: [553, "WEEKLY", 42] },
    daily: { rows: [[618, ["steps", "sauna", "wimhof"]], [660, ["dailydozen", "acv"]], [752, ["creatine", "collagen", "omega3", "prebiotic", "protein"]], [796, ["adaptogens", "carotenoids"]], [840, ["vitamink", "multivitamin", "caakg", "taurine_glycine"]]], label: [912, "DAILY", 54] }
  };

  function drawPyramid(svg) {
    var back = el("g", {}, svg), mid = el("g", {}, svg), front = el("g", {}, svg);
    var A2 = [A[0] + D[0], A[1] + D[1]], R2 = [R[0] + D[0], R[1] + D[1]];
    // white faces
    el("path", { d: "M" + A + " L" + R + " L" + L + " Z", fill: "#fff" }, back);
    el("path", { d: "M" + A + " L" + A2 + " L" + R2 + " L" + R + " Z", fill: "#fff" }, back);
    // coloured hatching on the side face, one colour per tier (the "pops of colour")
    var bands = [[A[1], CUTS[0], "annual"], [CUTS[0], CUTS[1], "monthly"], [CUTS[1], CUTS[2], "weekly"], [CUTS[2], L[1], "daily"]];
    bands.forEach(function (b) {
      for (var y = b[0] + 10; y < b[1] - 4; y += 11) {
        var x = CX + hw(y);
        pen(back, x + 6, y + 2, x + D[0] - 4, y + D[1] + 2 + j(2), { color: TIER[b[2]], w: 3.2, single: true, wob: 2, op: 0.85 });
      }
    });
    // outline: front triangle, extruded side
    polyPen(front, [A, R, L], { w: 3 });
    pen(front, A[0], A[1], A2[0], A2[1], { w: 3 });
    pen(front, A2[0], A2[1], R2[0], R2[1], { w: 3 });
    pen(front, R[0], R[1], R2[0], R2[1], { w: 3 });
    // tier dividers, continuing around the side like a ledge
    CUTS.forEach(function (y) {
      var h = hw(y);
      pen(front, CX - h, y, CX + h, y, { w: 2.6 });
      pen(front, CX + h, y, CX + h + D[0], y + D[1], { w: 2.2 });
    });
    // tier labels, centred at the bottom of each band
    Object.keys(LAYOUT).forEach(function (t) {
      var lb = LAYOUT[t].label;
      var tx = el("text", { x: CX, y: lb[0], "text-anchor": "middle", class: "tl", style: "font-size:" + lb[2] + "px" }, mid);
      tx.textContent = lb[1];
      // a coloured scribble under each tier label
      var w = lb[1].length * lb[2] * 0.42;
      pen(mid, CX - w, lb[0] + 8, CX + w, lb[0] + 5, { color: TIER[t], w: 5, wob: 3, op: 0.9 });
    });
    // Blueprint header + bracket
    var bjY = 706, bh = el("text", { x: CX, y: bjY, "text-anchor": "middle", class: "bjh" }, mid);
    bh.textContent = "~ Bryan Johnson's Blueprint stack ~";
    var top = 684, bot = 858, lx = CX - hw(top) + 22, rx = CX + hw(top) - 22, lx2 = CX - hw(bot) + 30, rx2 = CX + hw(bot) - 30;
    [[lx, top, rx, top], [rx, top, rx2, bot], [rx2, bot, lx2, bot], [lx2, bot, lx, top]].forEach(function (s) {
      el("path", { d: stroke(s[0], s[1], s[2], s[3], 3), fill: "none", stroke: "#555", "stroke-width": 1.6, "stroke-dasharray": "7 6", "stroke-linecap": "round" }, mid);
    });
    return { items: el("g", {}, svg) };
  }

  function drawItems(g) {
    Object.keys(LAYOUT).forEach(function (tier) {
      LAYOUT[tier].rows.forEach(function (row) {
        var y = row[0], ids = row[1], nodes = [], gap = 34, total = 0;
        ids.forEach(function (id) {
          var d = BY[id]; if (!d) return;
          var a = el("g", { class: "it", tabindex: 0, role: "link", "aria-label": d.title + " — open evidence" }, g);
          var mk = el("path", { class: "mk", fill: TIER[tier] }, a);
          var t = el("text", { x: 0, y: y }, a); t.textContent = d.label;
          var w = t.getComputedTextLength ? t.getComputedTextLength() : d.label.length * 12;
          if (!w) w = d.label.length * 12;
          nodes.push({ a: a, t: t, mk: mk, w: w, id: id }); total += w;
        });
        total += gap * (nodes.length - 1);
        var x = CX - total / 2;
        nodes.forEach(function (n) {
          n.t.setAttribute("x", x.toFixed(1));
          n.mk.setAttribute("d", blob(x - 6, y - 22, n.w + 12, 30));
          pen(n.a, x, y + 6, x + n.w, y + 5 + j(2), { color: TIER[tier], w: 2.4, single: true, wob: 2, op: 0.95 }).setAttribute("class", "ul");
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
    if (!svg || !ex) return;
    drawExplorer(ex);
    var layers = drawPyramid(svg);
    drawItems(layers.items);
    document.getElementById("hp-open").addEventListener("click", function () { ex.querySelectorAll("details.pol").forEach(function (d) { d.open = true; }); });
    document.getElementById("hp-close").addEventListener("click", function () { ex.querySelectorAll("details.pol").forEach(function (d) { d.open = false; }); });
    var h = location.hash.replace("#hp-", ""); if (BY[h]) setTimeout(function () { openItem(h); }, 300);
  }
  function start() { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(init, init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
