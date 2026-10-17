// Learn: password-gated flashcards + quizzes for Health, Finance and BCR.
// Progress lives in this browser's localStorage (per device).
(function () {
  "use strict";
  const KEY = "lr-v1", AUTH = "lr-auth";
  const GOAL_MIN = 20, NEW_PER_SESSION = 12;
  const INTERVALS = [0, 1, 3, 7, 16, 35]; // days per Leitner box
  const SUBJECTS = {
    health: { name: "Health", color: "#2f5fae", blurb: "Studies behind the Health Pyramid: findings, authors, designs" },
    finance: { name: "Finance", color: "#76bf94", blurb: "Core principles to read the Financial Dashboard" },
    bcr: { name: "BCR", color: "#f2c46d", blurb: "40 policies: rank, benefit per $1, key studies and quotes" }
  };
  const LEVELS = ["Novice", "Apprentice", "Student", "Scholar", "Analyst", "Expert", "Master", "Sage"];
  const $ = (s, el) => (el || document).querySelector(s);
  const app = $("#lr");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const dayAdd = (d, n) => { const t = new Date(d + "T12:00:00"); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a, n, not) => shuffle(a.filter((x) => x !== not && x != null && x !== "")).slice(0, n);
  const uniq = (a) => [...new Set(a)];
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const money = (bn) => bn == null ? "n/a" : bn >= 1000 ? "$" + (bn / 1000).toFixed(1) + " trillion" : "$" + Math.round(bn) + " billion";
  const ratio = (x) => x == null ? "?" : (x < 0 ? "−$" + Math.abs(x).toFixed(2) : "$" + (x >= 100 ? Math.round(x) : x.toFixed(2)));

  // ---------- state ----------
  let S;
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
    S.xp = S.xp || 0; S.cards = S.cards || {}; S.quiz = S.quiz || {}; S.min = S.min || {}; S.days = S.days || [];
    S.badges = S.badges || [];
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
  const level = () => { const n = Math.floor(Math.sqrt(S.xp / 120)); return { n: n + 1, name: LEVELS[Math.min(n, LEVELS.length - 1)], next: Math.pow(n + 1, 2) * 120, prev: Math.pow(n, 2) * 120 }; };
  function streak() {
    const set = new Set(S.days); let n = 0, d = today();
    if (!set.has(d)) d = dayAdd(d, -1);
    while (set.has(d)) { n++; d = dayAdd(d, -1); }
    return n;
  }
  const minToday = (subj) => ((S.min[today()] || {})[subj] || 0);

  // ---------- decks ----------
  let DATA, DECKS = {};
  function buildDecks() {
    const H = DATA.health, B = DATA.bcr.policies, F = window.LEARN_FINANCE || [];
    const topicById = Object.fromEntries(H.topics.map((t) => [t.id, t]));
    // Health
    const hc = [], hq = [];
    const allAuthors = uniq(H.studies.map((s) => s.authors));
    const allTitles = H.studies.map((s) => s.title);
    const allTopics = uniq(H.topics.map((t) => t.label));
    const tiers = uniq(H.topics.map((t) => t.tier));
    H.topics.forEach((t) => {
      const st = H.studies.filter((s) => s.topic === t.id);
      const tid = "h-t-" + t.id;
      hc.push({ id: tid, kind: "Pyramid item", front: `<div class="k">${esc(t.tier)} tier</div><h3>${esc(t.label)}</h3><p class="hint">What's the recommendation, and what's the evidence?</p>`,
        back: `<p>${esc(t.blurb)}</p><div class="k">${st.length} studies</div><ul>${st.map((s) => `<li><b>${esc(s.authors.split(",")[0])}</b> ${esc(s.year)}: ${esc(s.title)}</li>`).join("")}</ul>` });
      hq.push(() => mcq(`Which tier of the Health Pyramid is “${t.label}” in?`, t.tier, tiers.filter((x) => x !== t.tier), tid));
      hq.push(() => mcq(`Which pyramid item says: “${t.blurb}”`, t.label, pick(allTopics, 3, t.label), tid, true));
      st.forEach((s) => {
        const id = "h-" + hash(s.title);
        hc.push({ id, kind: "Study", front: `<div class="k">${esc(t.label)} · ${esc(s.type)}</div><h3>${esc(s.title)}</h3><p class="meta">${esc(s.authors)} (${esc(s.year)}) · <i>${esc(s.journal)}</i></p><p class="hint">What did it find?</p>`,
          back: `<p>${esc(s.summary)}</p>${s.quote ? `<blockquote>“${esc(s.quote)}”</blockquote>` : ""}${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">Open paper</a>` : ""}` });
        hq.push(() => mcq(`Who wrote “${s.title}” (${s.year})?`, s.authors, pick(allAuthors, 3, s.authors), id));
        hq.push(() => mcq(`“${s.title}” is evidence for which Health Pyramid item?`, t.label, pick(allTopics, 3, t.label), id));
        if (s.quote) hq.push(() => mcq(`Which study reported: “${s.quote}”`, s.title, pick(allTitles, 3, s.title), id, true));
        hq.push(() => mcq(`What kind of study is ${s.authors.split(",")[0]} et al. (${s.year}) on ${t.label.toLowerCase()}?`, s.type, pick(uniq(H.studies.map((x) => x.type)), 3, s.type), id));
        const others = H.studies.filter((x) => x.topic !== s.topic);
        hq.push(() => mcq(`Key finding of “${s.title}”?`, finding(s.summary), pick(others.map((x) => finding(x.summary)), 3), id, true));
      });
    });
    // BCR
    const bc = [], bq = [];
    BCR_METHOD.forEach((m) => { bc.push({ id: "b-m-" + m.id, kind: "How the dashboard works", front: `<h3>${esc(m.term)}</h3><p class="hint">Explain it.</p>`, back: `<p>${m.def}</p>` });
      (m.quiz || []).forEach((q) => bq.push(() => mcq(q.q, q.c[q.a], q.c.filter((_, i) => i !== q.a), "b-m-" + m.id))); });
    const names = B.map((p) => p.name);
    const allStudies = B.flatMap((p) => p.key_studies.map((k) => ({ ...k, policy: p.name })));
    B.forEach((p) => {
      const id = "b-p-" + hash(p.name);
      bc.push({ id, kind: "Policy", front: `<div class="k">${esc(p.category)}</div><h3>${esc(p.name)}</h3><p class="hint">Rank, verdict, benefit per $1, cost, evidence grade?</p>`,
        back: `<div class="pill v-${esc(p.verdict.toLowerCase())}">#${p.rank} of 40 · ${esc(p.verdict)}</div>
          <table class="facts"><tr><td>Benefit per $1</td><td><b>${ratio(p.bcr_low)} to ${ratio(p.bcr_high)}</b></td></tr>
          <tr><td>Yearly cost</td><td>${money(p.cost_bn)}</td></tr><tr><td>Evidence grade</td><td>${esc(p.grade)}</td></tr>
          <tr><td>Who benefits</td><td>${esc(p.who_benefits)}</td></tr><tr><td>Difficulty</td><td>${esc(p.difficulty)}</td></tr></table>
          <p>${esc(p.why)}</p>` });
      bc.push({ id: id + "-ev", kind: "Policy evidence", front: `<div class="k">${esc(p.name)}</div><h3>What's the best evidence, and the strongest counter-case?</h3>`,
        back: `<p><b>Evidence.</b> ${esc(p.evidence)}</p><p><b>Counter.</b> ${esc(p.counter)}</p><p class="meta">Grade ${esc(p.grade)}: ${esc(p.grade_reason)}</p>` });
      p.key_studies.slice(0, 3).forEach((k) => {
        const kid = "b-s-" + hash(k.title);
        bc.push({ id: kid, kind: "Key study", front: `<div class="k">${esc(p.name)} · ${esc(k.role)}</div><h3>${esc(k.title)}</h3><p class="meta">${esc(k.authors)} (${esc(k.year)}) · <i>${esc(k.venue)}</i></p><p class="hint">What did it report?</p>`,
          back: `<p>${esc(k.finding)}</p>${k.url ? `<a href="${esc(k.url)}" target="_blank" rel="noopener">Open source</a>` : ""}` });
        bq.push(() => mcq(`Who found: “${k.finding}”`, `${k.authors} (${k.year})`, pick(allStudies.filter((x) => x.authors !== k.authors).map((x) => `${x.authors} (${x.year})`), 3), kid, true));
        bq.push(() => mcq(`“${k.title}” (${k.year}) is evidence on which policy?`, p.name, pick(names, 3, p.name), kid));
      });
      p.quotes.forEach((q, i) => {
        const qid = "b-q-" + hash(q.text);
        bc.push({ id: qid, kind: "Quote", front: `<blockquote>“${esc(q.text)}”</blockquote><p class="hint">Which policy is this about?</p>`, back: `<h3>${esc(p.name)}</h3><p class="meta">Quoted in the ${esc(q.section)} section of the policy essay.</p>` });
        bq.push(() => mcq(`“${q.text}” Which policy?`, p.name, pick(names, 3, p.name), qid, true));
      });
      bq.push(() => mcq(`Where does ${p.name} rank (of 40)?`, rankBand(p.rank), pick(["1–5", "6–10", "11–20", "21–30", "31–36", "37–40"], 3, rankBand(p.rank)), id));
      bq.push(() => mcq(`${p.name}: verdict?`, p.verdict, pick(["Excellent", "Good", "Mid", "Bad", "Worst"], 3, p.verdict), id));
      const r = `${ratio(p.bcr_low)} to ${ratio(p.bcr_high)}`;
      bq.push(() => mcq(`${p.name}: benefit per $1 spent (published range)?`, r, pick(B.filter((x) => x !== p).map((x) => `${ratio(x.bcr_low)} to ${ratio(x.bcr_high)}`), 3, r), id));
      bq.push(() => mcq(`${p.name}: evidence grade?`, p.grade, pick(uniq(B.map((x) => x.grade)), 3, p.grade), id));
      bq.push(() => mcq(`${p.name}: who benefits most?`, p.who_benefits, ["pro-poor", "broad", "regressive"].filter((x) => x !== p.who_benefits), id));
      bq.push(() => mcq(`Which is about ${p.name}? “…”`, firstSentence(p.why, 1), pick(B.filter((x) => x !== p).map((x) => firstSentence(x.why, 1)), 3), id, true));
      const o = B[Math.floor(Math.random() * B.length)];
      if (o !== p) bq.push(() => mcq(`Which ranks higher: ${p.name} or ${o.name}?`, p.rank < o.rank ? p.name : o.name, [p.rank < o.rank ? o.name : p.name], id));
    });
    // Finance
    const fc = [], fq = [];
    F.forEach((c) => {
      fc.push({ id: c.id, kind: c.unit, front: `<div class="k">${esc(c.unit)}</div><h3>${esc(c.term)}</h3><p class="hint">Define it. Where is it on the dashboard?</p>`,
        back: `<p>${esc(c.def)}</p>${c.formula ? `<div class="formula">${esc(c.formula)}</div>` : ""}${c.page ? `<p><b>On the page:</b> ${esc(c.page)}</p>` : ""}${c.example ? `<p class="meta"><b>Example:</b> ${esc(c.example)}</p>` : ""}` });
      (c.quiz || []).forEach((q) => fq.push(() => mcq(q.q, q.c[q.a], q.c.filter((_, i) => i !== q.a), c.id)));
      fq.push(() => mcq(`Which term means: “${c.def}”`, c.term, pick(F.map((x) => x.term), 3, c.term), c.id, true));
    });
    DECKS = { health: { cards: hc, quiz: hq }, finance: { cards: fc, quiz: fq }, bcr: { cards: bc, quiz: bq } };
  }
  const rankBand = (r) => r <= 5 ? "1–5" : r <= 10 ? "6–10" : r <= 20 ? "11–20" : r <= 30 ? "21–30" : r <= 36 ? "31–36" : "37–40";
  // the result sentence: usually the 2nd (the 1st describes the design)
  function finding(s) { const p = String(s || "").split(/(?<=[.!?])\s+(?=[A-Z])/); return p[1] || p[0]; }
  function firstSentence(s, n) { const p = String(s || "").split(/(?<=[.!?])\s+(?=[A-Z])/); return p.slice(0, n).join(" "); }
  function mcq(q, answer, wrong, cardId, long) {
    const choices = shuffle([answer, ...uniq(wrong).filter((w) => w !== answer).slice(0, 3)]);
    return { q, answer, choices, cardId, long: !!long };
  }

  const BCR_METHOD = [
    { id: "bcr", term: "Benefit-cost ratio (BCR)", def: "Dollars of social benefit per $1 of cost. Above 1 the policy creates value; below 0 it destroys value even before counting its cost.",
      quiz: [{ q: "A BCR of 0.5 means…", c: ["$2 back per $1", "50 cents back per $1: costs exceed benefits", "It destroys value", "It's free"], a: 1 }] },
    { id: "verdicts", term: "Verdict bands", def: "Graded by the middle result per $1: <b>Excellent</b> $10+ · <b>Good</b> $2–10 · <b>Mid</b> $1–2 · <b>Bad</b> under $1 · <b>Worst</b> below zero.",
      quiz: [{ q: "A middle result of $4 per $1 gets which verdict?", c: ["Excellent", "Good", "Mid", "Bad"], a: 1 }, { q: "'Worst' means the middle result is…", c: ["Under $1", "Below zero", "Under $2", "Exactly $1"], a: 1 }] },
    { id: "draws", term: "Monte Carlo draws", def: "The dashboard simulates 1,000 draws per policy from each published low–high range, so the ranking reflects uncertainty and not a single point estimate.",
      quiz: [{ q: "How many simulated draws per policy?", c: ["100", "1,000", "10,000", "40"], a: 1 }] },
    { id: "mort", term: "Mortality adjustment", def: "Lost income costs lives (and gains save them). Step 0 prices the lives lost or saved through each policy's income change.",
      quiz: [{ q: "Why adjust for mortality?", c: ["Lives are excluded", "Income changes themselves cost or save lives", "To lower every ratio", "Required by law"], a: 1 }] },
    { id: "shrink", term: "Evidence-quality shrinkage", def: "The skepticism dial: weaker evidence (lower grade) pulls a policy's ratio toward break-even (1.0).",
      quiz: [{ q: "A C-graded policy with a high BCR gets pulled toward…", c: ["Zero", "Break-even (1.0)", "Its high estimate", "The average policy"], a: 1 }] },
    { id: "disc", term: "Discount rate", def: "Future benefits are worth less today. The dashboard can re-express every ratio at a different discount rate; higher rates hurt long-payoff policies like climate.",
      quiz: [{ q: "Raising the discount rate mostly hurts policies whose benefits…", c: ["Arrive immediately", "Arrive far in the future", "Are monetary", "Go to the poor"], a: 1 }] },
    { id: "mcda", term: "Multi-criteria scoring", def: "Beyond value, each policy is scored 0–1 on who benefits, feasibility (difficulty) and cost. Optional tilts favour the poor, easy or cheap policies.",
      quiz: [{ q: "Which is NOT one of the dashboard's criteria?", c: ["Who benefits", "Popularity on social media", "Feasibility", "Cost"], a: 1 }] },
    { id: "top20", term: "Rank uncertainty", def: "Every draw is re-ranked; the dashboard reports how often each policy finishes in the top 20, so you see how robust a rank is.",
      quiz: [{ q: "'In top 20 in 95% of draws' tells you the rank is…", c: ["Fragile", "Robust to uncertainty", "Always #1", "Wrong"], a: 1 }] },
    { id: "budget", term: "Budget exercise", def: "Greedy allocation: fund policies with BCR at or above a threshold, best first, skipping overlaps. Compared with spending the same money on the lowest-ratio policies.",
      quiz: [{ q: "In the budget exercise, overlapping policies are…", c: ["Both funded", "Counted only once", "Excluded entirely", "Doubled"], a: 1 }] },
    { id: "select", term: "How the 40 were chosen", def: "Ten each in Climate, Health, Freedom and Popular, picked from surveys and expert lists (e.g. the Peoples' Climate Vote) so the list covers what people actually propose.",
      quiz: [{ q: "The 40 policies are split across which four categories?", c: ["Tax, Trade, War, Tech", "Climate, Health, Freedom, Popular", "Left, Right, Center, Other", "US, EU, China, World"], a: 1 }] }
  ];

  // ---------- views ----------
  function gate() {
    app.innerHTML = `<div class="lr-gate"><h1 class="lr-title">Learn</h1><div class="lr-accent"></div><p class="lr-sub">Enter the password to start training.</p>
      <form id="lr-f"><input id="lr-p" type="password" inputmode="text" autocomplete="current-password" placeholder="Password" autofocus><button class="btn primary" type="submit">Enter</button></form><p id="lr-err" class="err"></p></div>`;
    $("#lr-f").onsubmit = async (e) => {
      e.preventDefault();
      if (await check($("#lr-p").value.trim().toLowerCase())) { try { localStorage.setItem(AUTH, "1"); } catch (er) {} start(); }
      else { $("#lr-err").textContent = "Wrong password."; $("#lr-p").select(); }
    };
  }
  async function check(p) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("") === window.LEARN_HASH;
    }
    return false;
  }

  function stats(subj) {
    const d = DECKS[subj]; const n = d.cards.length;
    let seen = 0, mastered = 0, due = 0; const t = today();
    d.cards.forEach((c) => { const s = S.cards[c.id]; if (s) { seen++; if (s.b >= 3) mastered++; if (s.due <= t) due++; } });
    const q = S.quiz[subj] || []; const last = q.slice(-50);
    return { n, seen, mastered, due, acc: last.length ? Math.round(100 * last.reduce((a, b) => a + b, 0) / last.length) : null, answered: q.length, min: minToday(subj) };
  }

  function home() {
    stopTimer();
    const L = level(), st = streak();
    const totalMin = Object.keys(SUBJECTS).reduce((a, k) => a + minToday(k), 0);
    app.innerHTML = `<h1 class="lr-title">Learn</h1><div class="lr-accent"></div><p class="lr-sub">Twenty minutes a day. Pick a subject.</p>
      <div class="lr-top"><div><div class="k">Level ${L.n}</div><div class="lvl">${L.name}</div></div>
        <div class="chips"><span class="chip">${st} day streak</span><span class="chip">${S.xp} XP</span></div></div>
      <div class="bar xp"><i style="width:${Math.min(100, 100 * (S.xp - L.prev) / (L.next - L.prev))}%"></i></div>
      <p class="sub">${L.next - S.xp} XP to level ${L.n + 1} · Today: ${Math.round(totalMin)} min trained</p>
      <div class="lr-h">Subjects</div>
      ${Object.entries(SUBJECTS).map(([k, s]) => { const x = stats(k); const pct = Math.round(100 * x.mastered / x.n);
        return `<button class="tile" data-s="${k}" style="--c:${s.color}"><div class="tile-h"><span class="nm">${s.name}</span><span class="pct">${pct}%</span></div>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <div class="tile-s">${s.blurb}</div>
          <div class="tile-g"><span><b>${x.mastered}</b>/${x.n} mastered</span><span><b>${x.seen}</b> seen</span><span><b>${x.acc == null ? "–" : x.acc + "%"}</b> quiz</span><span><b>${x.due}</b> due</span></div>
          <div class="goal"><div class="bar thin"><i style="width:${Math.min(100, 100 * x.min / GOAL_MIN)}%"></i></div><span>${Math.round(x.min)}/${GOAL_MIN} min today${x.min >= GOAL_MIN ? " · done" : ""}</span></div></button>`; }).join("")}
      <div class="badges">${BADGES.map((b) => `<span class="badge ${S.badges.includes(b.id) ? "on" : ""}" title="${esc(b.d)}">${esc(b.n)}</span>`).join("")}</div>
      <p class="foot">Progress is saved on this device. <button class="link" id="lr-out">Log out</button></p>`;
    app.querySelectorAll(".tile").forEach((b) => (b.onclick = () => session(b.dataset.s)));
    $("#lr-out").onclick = () => { try { localStorage.removeItem(AUTH); } catch (e) {} gate(); };
    window.scrollTo(0, 0);
  }

  // ---------- session ----------
  let T = null, sess = null;
  function stopTimer() { if (T) { clearInterval(T); T = null; } if (sess) { addMinutes(); sess = null; } }
  function addMinutes() {
    const now = Date.now(); const m = (now - sess.tick) / 60000; sess.tick = now;
    if (m > 0 && m < 10 && !document.hidden) { const d = today(); S.min[d] = S.min[d] || {}; S.min[d][sess.subj] = (S.min[d][sess.subj] || 0) + m; }
    save();
  }
  function session(subj) {
    const d = DECKS[subj], t = today();
    if (!S.days.includes(t)) { S.days.push(t); S.days = S.days.slice(-400); }
    const due = shuffle(d.cards.filter((c) => S.cards[c.id] && S.cards[c.id].due <= t));
    const fresh = d.cards.filter((c) => !S.cards[c.id]).slice(0, NEW_PER_SESSION);
    sess = { subj, queue: [...due.map((c) => ({ c, type: "review" })), ...fresh.map((c) => ({ c, type: "new" }))], n: 0, right: 0, combo: 0, xp0: S.xp, start: Date.now(), tick: Date.now(), since: 0 };
    interleave();
    T = setInterval(() => { addMinutes(); paintTimer(); }, 15000);
    next();
  }
  function interleave() {
    // a quiz after every 3 cards, drawn from cards already seen in this subject
    const q = []; let k = 0;
    sess.queue.forEach((x) => { q.push(x); if (++k % 3 === 0) q.push({ type: "quiz" }); });
    if (!q.length) for (let i = 0; i < 15; i++) q.push({ type: "quiz" });
    sess.queue = q;
  }
  function paintTimer() {
    const m = minToday(sess.subj); const el = $("#lr-tm"); if (!el) return;
    el.innerHTML = `${Math.floor(m)}/${GOAL_MIN} min`; const b = $("#lr-tb"); if (b) b.style.width = Math.min(100, 100 * m / GOAL_MIN) + "%";
  }
  function header() {
    const s = SUBJECTS[sess.subj];
    return `<div class="lr-bar"><button class="link" id="lr-home">Home</button><span class="ttl">${s.name}</span><span class="chip" id="lr-tm"></span></div>
      <div class="bar thin"><i id="lr-tb"></i></div><div class="lr-meta"><span>Combo ${sess.combo}</span><span>+${S.xp - sess.xp0} XP</span><span>${sess.queue.length} left</span></div>`;
  }
  function next() {
    if (!sess) return;
    let item = sess.queue.shift();
    if (!item) item = refill();
    if (!item) return done();
    if (item.type === "quiz") return quiz(item);
    card(item);
  }
  function refill() {
    // after the planned queue, keep training with quizzes + more new cards until the user stops
    const d = DECKS[sess.subj];
    const fresh = d.cards.filter((c) => !S.cards[c.id]).slice(0, 6).map((c) => ({ c, type: "new" }));
    sess.queue = [...fresh]; interleave();
    if (!sess.queue.length) for (let i = 0; i < 10; i++) sess.queue.push({ type: "quiz" });
    return sess.queue.shift();
  }
  function card(item) {
    const c = item.c;
    app.innerHTML = header() + `<div class="card ${item.type}"><div class="tag">${item.type === "new" ? "NEW · " : "REVIEW · "}${esc(c.kind)}</div><div class="front">${c.front}</div><div class="back" hidden>${c.back}</div></div>
      <div class="actions"><button class="btn primary" id="lr-show">Show answer</button></div>`;
    paintTimer(); bindHome();
    $("#lr-show").onclick = () => {
      $(".back").hidden = false; $("#lr-show").remove();
      $(".actions").innerHTML = `<button class="btn" id="lr-no">Didn't know</button><button class="btn primary" id="lr-yes">Knew it</button>`;
      $("#lr-no").onclick = () => grade(c, false, item); $("#lr-yes").onclick = () => grade(c, true, item);
      $(".back").scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
  function grade(c, ok, item) {
    const s = S.cards[c.id] || { b: 0, seen: 0, r: 0, w: 0 };
    s.seen++; if (ok) { s.r++; s.b = Math.min(5, s.b + 1); } else { s.w++; s.b = Math.max(0, s.b - 2); }
    s.due = dayAdd(today(), ok ? INTERVALS[s.b] : 0); S.cards[c.id] = s;
    gain(ok ? 5 : 1, ok);
    if (!ok) sess.queue.splice(Math.min(3, sess.queue.length), 0, { c, type: "review" }); // see it again soon
    save(); next();
  }
  function pickQuiz() {
    const d = DECKS[sess.subj]; const seen = new Set(Object.keys(S.cards));
    const pool = d.quiz;
    for (let i = 0; i < 200; i++) {
      const q = pool[Math.floor(Math.random() * pool.length)]();
      if (q && q.choices.length >= 2 && seen.has(q.cardId)) return q;
    }
    return pool[Math.floor(Math.random() * pool.length)]();
  }
  function quiz() {
    const q = pickQuiz();
    app.innerHTML = header() + `<div class="card quiz"><div class="tag">QUIZ</div><h3 class="${q.q.length > 160 ? "small" : ""}">${esc(q.q)}</h3>
      <div class="choices ${q.long ? "long" : ""}">${q.choices.map((c, i) => `<button class="choice" data-i="${i}">${esc(c)}</button>`).join("")}</div><div class="fb"></div></div><div class="actions"></div>`;
    paintTimer(); bindHome();
    app.querySelectorAll(".choice").forEach((b) => (b.onclick = () => {
      const ok = q.choices[+b.dataset.i] === q.answer;
      app.querySelectorAll(".choice").forEach((x) => { x.disabled = true; if (q.choices[+x.dataset.i] === q.answer) x.classList.add("right"); });
      if (!ok) b.classList.add("wrong");
      (S.quiz[sess.subj] = S.quiz[sess.subj] || []).push(ok ? 1 : 0); S.quiz[sess.subj] = S.quiz[sess.subj].slice(-500);
      const s = S.cards[q.cardId]; if (s) { if (ok) s.b = Math.min(5, s.b + 1); else { s.b = Math.max(0, s.b - 1); s.due = today(); } }
      gain(ok ? 10 : 2, ok); save();
      $(".fb").innerHTML = ok ? `<b class="okt">Correct! +${10 * mult()} XP</b>` : `<b class="bad">Not quite.</b> Answer: ${esc(q.answer)}`;
      $(".actions").innerHTML = `<button class="btn primary" id="lr-n">Next</button>`; $("#lr-n").onclick = next;
      $(".actions").scrollIntoView({ behavior: "smooth", block: "end" });
    }));
  }
  const mult = () => (sess.combo >= 10 ? 3 : sess.combo >= 5 ? 2 : 1);
  function gain(x, ok) {
    sess.n++; if (ok) { sess.right++; sess.combo++; } else sess.combo = 0;
    S.xp += x * (ok ? mult() : 1); checkBadges();
  }
  function bindHome() { $("#lr-home").onclick = () => done(); }
  function done() {
    const sub = sess.subj, n = sess.n, r = sess.right, xp = S.xp - sess.xp0; stopTimer();
    const m = minToday(sub);
    app.innerHTML = `<div class="card done"><h2>${m >= GOAL_MIN ? "Daily goal hit!" : "Nice work"}</h2>
      <p>${n} items · ${n ? Math.round(100 * r / n) : 0}% right · +${xp} XP</p><p>${Math.round(m)}/${GOAL_MIN} min of ${SUBJECTS[sub].name} today</p></div>
      <div class="actions"><button class="btn" id="lr-h2">Home</button><button class="btn primary" id="lr-again">Keep going</button></div>`;
    $("#lr-h2").onclick = home; $("#lr-again").onclick = () => session(sub);
  }

  const BADGES = [
    { id: "first", n: "First session", d: "Finish any card", t: () => Object.keys(S.cards).length > 0 },
    { id: "s3", n: "3-day streak", d: "Train 3 days in a row", t: () => streak() >= 3 },
    { id: "s7", n: "7-day streak", d: "Train 7 days in a row", t: () => streak() >= 7 },
    { id: "m50", n: "50 mastered", d: "50 cards in box 3+", t: () => Object.values(S.cards).filter((c) => c.b >= 3).length >= 50 },
    { id: "m200", n: "200 mastered", d: "200 cards in box 3+", t: () => Object.values(S.cards).filter((c) => c.b >= 3).length >= 200 },
    { id: "combo", n: "Combo 10", d: "10 right in a row", t: () => sess && sess.combo >= 10 },
    { id: "goal", n: "20-min day", d: "Hit the 20-minute goal", t: () => Object.keys(SUBJECTS).some((k) => minToday(k) >= GOAL_MIN) }
  ];
  function checkBadges() { BADGES.forEach((b) => { if (!S.badges.includes(b.id) && b.t()) { S.badges.push(b.id); toast(`Badge earned: ${b.n}`); } }); }
  function toast(t) { const el = document.createElement("div"); el.className = "lr-toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }

  // ---------- boot ----------
  async function start() {
    app.innerHTML = `<p class="sub">Loading…</p>`;
    if (!DATA) { const r = await fetch("learn/data.json?v=" + (window.LEARN_V || "1")); DATA = await r.json(); buildDecks(); }
    home();
  }
  document.addEventListener("visibilitychange", () => { if (sess) { if (document.hidden) addMinutes(); else sess.tick = Date.now(); } });
  load();
  let authed = false; try { authed = localStorage.getItem(AUTH) === "1"; } catch (e) {}
  authed ? start() : gate();
})();
