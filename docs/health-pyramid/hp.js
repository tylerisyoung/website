/* Health Pyramid — hand-drawn diagram (rough.js) pyramid + evidence explorer. */
(function () {
  "use strict";
  var DATA = window.HP_DATA || [];
  var BY = {}; DATA.forEach(function (d) { BY[d.id] = d; });
  var NS = "http://www.w3.org/2000/svg";
  var TIER = { supplements: "#e8772e", daily: "#2f5fae", weekly: "#f2c46d", monthly: "#76bf94", annual: "#e07a7a" };
  var INK = "#1a1a1a";
  var rc, SEED = 7;
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function o(extra) { var b = { roughness: 1.3, bowing: 1.4, stroke: INK, strokeWidth: 3, seed: SEED++ }; for (var k in extra) b[k] = extra[k]; return b; }
  function put(g, node) { g.appendChild(node); return node; }

  // geometry: apex fixed, slope fixed, height grows with the content
  var W = 1100, CX = 520, AY = 50, SLOPE = 0.85, PAD = 34, ROW = 40, GAP = 24;
  function hw(y) { return SLOPE * (y - AY); }
  var TIERS = ["annual", "monthly", "weekly", "daily", "supplements"];
  var LABEL = { annual: "ANNUAL", monthly: "MONTHLY", weekly: "WEEKLY", daily: "DAILY", supplements: "SUPPLEMENTS" };
  var LSIZE = { annual: 20, monthly: 26, weekly: 30, daily: 34, supplements: 34 };

  // greedy wrap of measured chips into rows that fit the pyramid at each height
  function layout(meas) {
    var y = AY, rows = [], cuts = [], labels = [], heads = [];
    var MAXPER = { annual: 2 };
    TIERS.forEach(function (t, ti) {
      var groups = [DATA.filter(function (d) { return d.tier === t && d.group === "food"; }), DATA.filter(function (d) { return d.tier === t && !d.group; })];
      var avail = function (yy) { return 2 * hw(yy - 22) - 2 * PAD; };
      // tier title sits at the top of its band, items below it
      y += ti === 0 ? 30 : 22;
      y += LSIZE[t] * 0.8;
      var first = groups[0].length ? groups[0] : groups[1];
      if (ti === 0 && first.length) {
        // push the apex band down until the first row (up to MAXPER chips) fits
        var need = 0, k = Math.min(first.length, MAXPER[t] || first.length);
        for (var j = 0; j < k; j++) need += meas[first[j].id] + (j ? GAP : 0);
        while (avail(y + 14 + ROW - 6) < need) y += 4;
      }
      labels.push({ y: y, tier: t });
      y += 14 + ROW - 6;
      groups.forEach(function (list, gi) {
        if (!list.length) return;
        if (gi === 0) { heads.push({ y: y - 6, text: "Food" }); y += ROW - 14; }
        if (gi === 1 && groups[0].length) { y += 4; heads.push({ y: y - 6, text: "Supplements" }); y += ROW - 14; }
        // rows needed by a greedy wrap, then spread the items evenly over that many rows
        var nr = 0, gi2 = 0, yy = y;
        while (gi2 < list.length) { var ww = 0, c = 0; while (gi2 < list.length && c < (MAXPER[t] || 1e9)) { var ad = meas[list[gi2].id] + (c ? GAP : 0); if (c && ww + ad > avail(yy)) break; ww += ad; c++; gi2++; } nr++; yy += ROW; }
        var per = Math.min(MAXPER[t] || 1e9, Math.ceil(list.length / nr));
        var i = 0;
        while (i < list.length) {
          var row = [], w = 0, cap = per;
          while (i < list.length && row.length < cap) {
            var add = meas[list[i].id] + (row.length ? GAP : 0);
            if (row.length && w + add > avail(y)) break;
            row.push(list[i]); w += add; i++;
          }
          rows.push({ y: y, tier: t, items: row, w: w });
          y += ROW;
        }
      });
      y += -ROW + 26;
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

  var BADGE = { "meta-analysis": "#1c3f80", "systematic review": "#2f5fae", "RCT": "#4f9d69", "cohort": "#b8850d", "guideline": "#5d7189", "review": "#8a94a3", "animal study": "#a61c1c" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function srcHtml(s) { return "<li>" + s.apa + "</li>"; }
  function itemHtml(d) {
    return '<details class="pol" id="hp-' + d.id + '"><summary>' + esc(d.title) + '</summary><div class="polbody">' + (d.sources.length ? '<ol class="apa">' + d.sources.map(srcHtml).join("") + "</ol>" : '<p class="pending">Sources are being added.</p>') + "</div></details>";
  }

  var INTRO = {
    annual: "Once a year get a blood test to track your vitals, including ApoB, Lp(a), testosterone, hs-CRP and HbA1c, and get a CT angiogram to see what's actually going on in your arteries. Get a biological age test too so you know if all of this is actually slowing you down. Do a parasite cleanse every year too, the longer you wait the worse it gets, and papaya seeds and pumpkin seeds help with the cleanse. And finally a 72 hour or longer fast once a year is one of the best things there is for cancer, aging and all cause mortality, so suck it up and put the fork down.",
    monthly: "Once a month do a 24 hour fast to give your gut a break and let your body clean house, test your VO2 max so you know if your cardio is actually working, and take an endurance adventure day, a long hike, ride, paddle or run somewhere wild that pushes your limits. Easy to put on the calendar, hard to actually do, so just do it.",
    weekly: "Every week lift heavy 2-3 times, get your cardio in with around 7 hours of easy zone 2, a hard zone 5 session (4x4 style) and a long run of 5K or more, and do a cold plunge. Add mobility and stability work so you don't fall apart when you get old, and make time for friends and getting outside in nature, social time and green space are some of the most underrated longevity tools there are.",
    daily: "Every day is the foundation. Sleep 8 hours and wake up at the same time every day, get morning sunlight in your eyes, drink a gallon of water, hit the sauna, do Wim Hof breathing and hit your protein target. Nail these and everything else on the pyramid works better.",
    supplements: "Food first: the daily dozen, quality protein, fish, liver, nuts, flax and the rest are the base. Then this is a list of supplements used by the leading anti-aging people and top performance athletes, built on a solid foundation of research. Talk to a doctor before adding anything."
  };
  function drawExplorer(host) {
    var tiers = [["annual", "Annual"], ["monthly", "Monthly"], ["weekly", "Weekly"], ["daily", "Daily"], ["supplements", "Supplements"]];
    var html = "";
    tiers.forEach(function (t) {
      var list = DATA.filter(function (d) { return d.tier === t[0]; });
      var core = list.filter(function (d) { return !d.group; }), food = list.filter(function (d) { return d.group === "food"; }), bj = [];
      html += '<section class="tier ' + t[0] + '"><h3>' + t[1] + "<small>" + list.length + " item" + (list.length > 1 ? "s" : "") + "</small></h3>" + (INTRO[t[0]] ? '<p class="tintro">' + INTRO[t[0]] + "</p>" : "") + (food.length ? '<div class="grp">Food</div>' + food.map(itemHtml).join("") + '<div class="grp">Supplements</div>' : "") + core.map(itemHtml).join("");
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
