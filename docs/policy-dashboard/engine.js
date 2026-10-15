/*
 * Benefit-cost ranking engine for the Policy Priorities dashboard.
 *
 * Pipeline for one set of settings, applied to the stored Monte Carlo draws
 * (1,000 draws per policy from each published range):
 *   0. mortalityAdjust  cost of lives lost (or saved) through income changes
 *   1. shrinkByGrade    evidence-quality adjustment (skepticism dial)
 *   2. timeAdjust       re-express at a different discount rate
 *   3. criteria         value, who benefits, feasibility, cost (all 0-1)
 *   4. score            benefit-cost value plus optional preference tilts
 *   5. rankStats        how often each policy finishes in the top 20
 *   6. budget functions which policies clear a threshold, and the counterfactual
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BCA = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TOP_N = 20;
  const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-"];
  const GRADE_WEIGHT = { "A+": 1.0, A: 0.95, "A-": 0.9, "B+": 0.85, B: 0.8, "B-": 0.75, "C+": 0.7, C: 0.65, "C-": 0.6 };
  const MIN_WEIGHT = 0.6;
  const FEAS_SCORE = { easy: 1, moderate: 0.5, hard: 0 };
  const WHO_SCORE = { "pro-poor": 1, broad: 0.5, regressive: 0 };
  const MORT_F = 13.1 / 99.3;
  const TILT_MAX = 0.3;
  const TILT_NAMES = ["equity", "feasibility", "cost"];

  // Policies whose benefits overlap (nested or shared mechanism). In the budget
  // exercise only one member of each group is counted.
  const OVERLAP = [[17, 20], [2, 8], [11, 12], [5, 8], [5, 9]];

  const isNA = (x) => x === null || x === undefined || Number.isNaN(x);
  const num = (x) => {
    if (x === null || x === undefined || x === "" || x === "NA") return NaN;
    const v = Number(x);
    return Number.isFinite(v) ? v : NaN;
  };

  // Signed log so harms and benefits sit on one comparable scale
  const slog = (x) => Math.sign(x) * Math.log10(1 + Math.abs(x));

  // Quantile of a sorted array, R's default (type 7)
  function quantileSorted(s, p) {
    const n = s.length;
    const idx = (n - 1) * p;
    const lo = Math.floor(idx + 4 * Number.EPSILON);
    const h = idx - lo;
    if (lo + 1 >= n || h === 0) return s[lo];
    return (1 - h) * s[lo] + h * s[lo + 1];
  }
  const sortNum = (a) => Float64Array.from(a).sort();
  const median = (a) => quantileSorted(sortNum(a), 0.5);

  function rescale01(x) {
    let lo = Infinity, hi = -Infinity;
    for (const v of x) if (!isNA(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo === 0) return x.map(() => 0.5);
    return x.map((v) => (v - lo) / (hi - lo));
  }

  // Evidence-quality shrinkage: weaker evidence pulls a ratio toward break-even.
  function shrinkByGrade(bcr, grade, skepticism) {
    const w = GRADE_WEIGHT[grade] !== undefined ? GRADE_WEIGHT[grade] : MIN_WEIGHT;
    const k = 1 - skepticism * (1 - w);
    if (isNA(bcr)) return NaN;
    return bcr > 0 ? Math.exp(k * Math.log(Math.max(bcr, 1e-12))) : k * bcr;
  }

  // Re-express a ratio discounted at baseRate at a different rate
  const timeFactor = (rate, baseRate, lag) => Math.pow((1 + baseRate) / (1 + rate), lag);

  // Lost income costs lives: net income change per $1 of cost is a + b x ratio
  const mortalityAdjust = (bcr, a, b) => bcr + MORT_F * (a + b * bcr);

  // Convert the CSV-style policy rows into typed records
  function preparePolicies(rows) {
    return rows.map((r) => ({
      ...r,
      id: num(r.id),
      bcr_low: num(r.bcr_low),
      bcr_high: num(r.bcr_high),
      cost_bn: num(r.cost_bn),
      gain_bn: num(r.gain_bn),
      base_bn: num(r.base_bn),
      mort_a: isNA(num(r.mort_a)) ? 0 : num(r.mort_a),
      mort_b: isNA(num(r.mort_b)) ? 0 : num(r.mort_b),
      income_loss_bn: num(r.income_loss_bn),
      emde_loss_lo: num(r.emde_loss_lo),
      emde_loss_hi: num(r.emde_loss_hi),
      rated: String(r.rated).toUpperCase() === "TRUE",
    }));
  }

  // Build the engine once: the raw draws are mortality-adjusted up front because
  // that step does not depend on any setting.
  function createModel(policyRows, rawDraws) {
    const all = preparePolicies(policyRows);
    const keep = [];
    all.forEach((p, j) => { if (p.rated) keep.push(j); });
    const pol = keep.map((j) => all[j]);
    const nS = rawDraws.length, nP = pol.length;
    const M = new Float64Array(nS * nP);         // row-major: draw i, policy j
    for (let i = 0; i < nS; i++) {
      const row = rawDraws[i];
      for (let j = 0; j < nP; j++) {
        const p = pol[j];
        M[i * nP + j] = mortalityAdjust(num(row[keep[j]]), p.mort_a, p.mort_b);
      }
    }
    const R0 = new Float64Array(nS * nP);
    for (let i = 0; i < nS; i++) for (let j = 0; j < nP; j++) R0[i * nP + j] = num(rawDraws[i][keep[j]]);
    return { all, pol, nS, nP, M, R0 };
  }

  function criteriaMatrix(pol, med) {
    const value = rescale01(med.map(slog));
    const costRaw = pol.map((p) => Math.max(isNA(p.cost_bn) ? 0 : p.cost_bn, 0));
    const costScaled = rescale01(costRaw.map((c) => Math.log10(1 + c)));
    return pol.map((p, j) => ({
      value: value[j],
      equity: WHO_SCORE[p.who_benefits] !== undefined ? WHO_SCORE[p.who_benefits] : 0.5,
      feasibility: FEAS_SCORE[p.difficulty] !== undefined ? FEAS_SCORE[p.difficulty] : 0,
      cost: 1 - costScaled[j],
    }));
  }

  function tiltPart(c, tilts) {
    let s = 0;
    for (const k of TILT_NAMES) {
      const t = tilts && !isNA(tilts[k]) ? tilts[k] : 0;
      s += (c[k] - 0.5) * (TILT_MAX * t);
    }
    return s;
  }

  // Ranks of every policy in every draw, descending score; ties go to policy order
  function rankStats(S, nS, nP, topN) {
    const ranks = new Float64Array(nS * nP);
    const order = new Array(nP);
    for (let i = 0; i < nS; i++) {
      const off = i * nP;
      for (let j = 0; j < nP; j++) order[j] = j;
      order.sort((a, b) => (S[off + b] - S[off + a]) || (a - b));
      for (let r = 0; r < nP; r++) ranks[off + order[r]] = r + 1;
    }
    const out = [];
    const col = new Float64Array(nS);
    for (let j = 0; j < nP; j++) {
      let top = 0;
      for (let i = 0; i < nS; i++) { col[i] = ranks[i * nP + j]; if (col[i] <= topN) top++; }
      col.sort();
      out.push({
        p_top: top / nS,
        rank_med: quantileSorted(col, 0.5),
        rank_lo: quantileSorted(col, 0.05),
        rank_hi: quantileSorted(col, 0.95),
      });
    }
    return out;
  }

  // Main entry point: one row per policy, best first.
  // tilts: equity, feasibility, cost in [-1, 1]; positive favours the poor / easy / cheap.
  function runBca(model, opts) {
    const o = Object.assign({ skepticism: 0.5, rate: 0.05, baseRate: 0.05, lag: 10, tilts: {}, topN: TOP_N, deaths: true, view: "mid" }, opts || {});
    const { pol, nS, nP } = model;
    const M = o.deaths ? model.M : model.R0;
    const tf = timeFactor(o.rate, o.baseRate, o.lag);
    const D = new Float64Array(nS * nP);
    for (let i = 0; i < nS; i++) {
      for (let j = 0; j < nP; j++) {
        const k = i * nP + j;
        D[k] = shrinkByGrade(M[k], pol[j].grade, o.skepticism) * tf;
      }
    }
    const med = [], q05 = [], q95 = [];
    const col = new Float64Array(nS);
    for (let j = 0; j < nP; j++) {
      for (let i = 0; i < nS; i++) col[i] = D[i * nP + j];
      col.sort();
      med.push(quantileSorted(col, 0.5));
      q05.push(quantileSorted(col, 0.05));
      q95.push(quantileSorted(col, 0.95));
    }
    // Optional view: rank on the low or high end of each policy's simulated range
    if (o.view === "low") med.splice(0, med.length, ...q05);
    else if (o.view === "high") med.splice(0, med.length, ...q95);
    const C = criteriaMatrix(pol, med);
    const other = C.map((c) => tiltPart(c, o.tilts));
    const score = C.map((c, j) => c.value + other[j]);

    // Rank uncertainty: re-score every draw (value varies, tilts fixed)
    const sm = med.map(slog);
    const lo = Math.min(...sm), hi = Math.max(...sm);
    const span = Math.max(hi - lo, 1e-9);
    const S = new Float64Array(nS * nP);
    for (let k = 0; k < S.length; k++) S[k] = (slog(D[k]) - lo) / span + other[k % nP];
    const rs = rankStats(S, nS, nP, o.topN);

    const rows = pol.map((p, j) => ({
      id: p.id, title: p.title, short: p.short, category: p.category, grade: p.grade,
      difficulty: p.difficulty, who_benefits: p.who_benefits, cost_bn: p.cost_bn,
      bcr_low: p.bcr_low, bcr_high: p.bcr_high, gain_bn: p.gain_bn, base_bn: p.base_bn,
      bcr_median: med[j], bcr_q05: q05[j], bcr_q95: q95[j],
      value: C[j].value, equity: C[j].equity, feasibility: C[j].feasibility, cost: C[j].cost,
      score: score[j], ...rs[j], _j: j,
    }));
    rows.sort((a, b) => (b.score - a.score) || (a._j - b._j));
    rows.forEach((r, i) => { r.rank = i + 1; delete r._j; });
    return rows;
  }

  // Stable sorts on a copy, matching R's order()
  const byMedAsc = (res) => res.map((r, i) => [r, i]).sort((a, b) => (a[0].bcr_median - b[0].bcr_median) || (a[1] - b[1])).map((x) => x[0]);
  const byMedDesc = (res) => res.map((r, i) => [r, i]).sort((a, b) => (b[0].bcr_median - a[0].bcr_median) || (a[1] - b[1])).map((x) => x[0]);
  const costed = (r) => !isNA(r.cost_bn) && r.cost_bn > 0;
  const groupOf = (id) => OVERLAP.filter((g) => g.includes(id)).flat();
  const blocked = (id, taken) => {
    const grp = groupOf(id);
    return grp.length > 0 && taken.some((t) => t !== id && grp.includes(t));
  };

  // Every policy that clears a benefit-cost threshold, best first
  function withBase(rows) {
    return rows.map((r) => {
      const cost_used = Math.max(isNA(r.cost_bn) ? 0 : r.cost_bn, 0);
      const base = isNA(r.base_bn) ? cost_used : r.base_bn;
      const benefit_bn = base * r.bcr_median;   // on the cost base the ratio is measured against
      return { ...r, cost_used, benefit_bn, net_bn: benefit_bn - base };
    });
  }
  function portfolio(res, minBcr = 1) {
    return withBase(byMedDesc(res.filter((r) => r.bcr_median >= minBcr)));
  }

  // Greedy allocation: fund policies with ratio >= minBcr in descending order of
  // ratio, skipping any that no longer fit or that overlap one already funded.
  function fundBudget(res, budget, minBcr = 1) {
    const r = byMedDesc(res.filter((x) => x.bcr_median >= minBcr && costed(x)));
    let left = budget;
    const taken = [], out = [];
    for (const x of r) {
      if (blocked(x.id, taken)) continue;
      if (x.cost_bn <= left) {
        left -= x.cost_bn;
        taken.push(x.id);
        out.push({ ...x, spend: x.cost_bn, net: x.cost_bn * (x.bcr_median - 1) });
      }
    }
    return out;
  }

  // Counterfactual: the same amount spread equally across the costed policies
  // among the n lowest-ratio policies.
  function fundWorst(res, amount, n = 10) {
    const w = byMedAsc(res).slice(0, Math.min(n, res.length)).filter(costed);
    return w.map((x) => { const spend = amount / w.length; return { ...x, spend, net: spend * (x.bcr_median - 1) }; });
  }

  // Full implementation of the n lowest-ratio policies at their sourced yearly
  // cost. Where two overlap, only the lower-ranked (worse) member is counted.
  function fundWorstFull(res, n = 10) {
    let w = byMedAsc(res).slice(0, Math.min(n, res.length)).filter(costed);
    const drop = [];
    for (const g of OVERLAP) {
      const m = w.filter((x) => g.includes(x.id));
      if (m.length > 1) {
        const worst = Math.max(...m.map((x) => x.rank));
        m.forEach((x) => { if (x.rank !== worst) drop.push(x.id); });
      }
    }
    w = w.filter((x) => !drop.includes(x.id));
    return w.map((x) => {
      const base = isNA(x.base_bn) ? x.cost_bn : x.base_bn;
      return { ...x, spend: x.cost_bn, net: base * (x.bcr_median - 1) };   // net on the ratio's own cost base
    });
  }

  // The n highest-ratio policies carried out in full (overlaps counted once).
  // Zero-cost reforms use their sourced yearly gain instead of spending x (ratio - 1).
  function fundBestFull(res, n = 10) {
    const b = byMedDesc(res);
    const keep = [], taken = [];
    for (const x of b) {
      if (keep.length >= n) break;
      if (blocked(x.id, taken)) continue;
      keep.push(x);
      taken.push(x.id);
    }
    return keep.map((x) => {
      const c = costed(x);
      const gain = x.gain_bn;
      const based = !c && !isNA(x.base_bn) && x.base_bn > 0;   // zero-cost reform measured per $ of revenue given up
      return {
        ...x,
        spend: c ? x.cost_bn : 0,
        net: c ? x.cost_bn * (x.bcr_median - 1) : (based ? x.base_bn * (x.bcr_median - 1) : (isNA(gain) ? 0 : gain)),
        priced: c || based || !isNA(gain),
      };
    });
  }

  // The n policies with the lowest adjusted ratio (used for listing)
  function worstN(res, n = 10) {
    return withBase(byMedAsc(res).slice(0, Math.min(n, res.length)));
  }

  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  return {
    TOP_N, GRADES, GRADE_WEIGHT, FEAS_SCORE, WHO_SCORE, MORT_F, TILT_MAX, OVERLAP,
    num, isNA, slog, quantileSorted, median, rescale01, shrinkByGrade, timeFactor, mortalityAdjust,
    preparePolicies, createModel, criteriaMatrix, runBca,
    portfolio, fundBudget, fundWorst, fundWorstFull, fundBestFull, worstN, sum,
  };
});
