// Zotero 7 "Run JavaScript" (async) helper, stage 2: highlight each source's key finding in its PDF.
// Finds the verbatim "highlight" phrase from docs/health-pyramid/data.js in the PDF text layer and
// saves a yellow highlight annotation over it. Options: globalThis.HP_ONLY (item id), HP_FLIP (y-axis), HP_DRY.
const DATA_URL = "https://raw.githubusercontent.com/tylerisyoung/website/" + (globalThis.HP_REF || "master") + "/docs/health-pyramid/data.js";
const lib = Zotero.Libraries.userLibraryID;
const ST = (Zotero.HPhl = { stage: "start", done: 0, highlighted: 0, already: 0, nopdf: [], notfound: [], errors: [], sample: null });
const txt = (await Zotero.HTTP.request("GET", DATA_URL + "?t=" + Date.now())).responseText;
const DATA = JSON.parse(txt.replace(/^window\.HP_DATA=/, "").replace(/;\s*$/, ""));
const TAG = "Health Pyramid key finding";

async function findByDOI(doi) {
  const s = new Zotero.Search(); s.libraryID = lib; s.addCondition("DOI", "is", doi);
  const ids = await s.search(); return ids.length ? Zotero.Items.get(ids[0]) : null;
}
async function findByTitle(t) {
  const s = new Zotero.Search(); s.libraryID = lib; s.addCondition("title", "is", t);
  const ids = await s.search(); return ids.length ? Zotero.Items.get(ids[0]) : null;
}
// collect words: arrays whose first 4 entries are numbers and last entry is a string
function collectWords(node, out) {
  if (!Array.isArray(node)) return;
  if (node.length >= 5 && typeof node[node.length - 1] === "string" && node.slice(0, 4).every((v) => typeof v === "number")) { out.push(node); return; }
  for (const n of node) collectWords(n, out);
}
const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[‐-―]/g, "-").replace(/[^a-z0-9]/g, "");
function locate(words, phrase) {
  // char-level map from normalized concatenation to word index
  let cat = "", map = [];
  words.forEach((w, i) => { const t = norm(w[w.length - 1]); for (const ch of t) { cat += ch; map.push(i); } });
  const tries = [phrase];
  const toks = phrase.split(/\s+/);
  if (toks.length > 10) { tries.push(toks.slice(0, 10).join(" ")); tries.push(toks.slice(-10).join(" ")); }
  for (const t of tries) {
    const p = norm(t); if (p.length < 12) continue;
    const at = cat.indexOf(p);
    if (at >= 0) {
      // extend to full phrase length when a partial prefix matched
      let end = at + p.length - 1;
      if (t !== phrase && t === tries[1]) { const full = norm(phrase); end = Math.min(cat.length - 1, at + full.length - 1); }
      if (t !== phrase && t === tries[2]) { const full = norm(phrase); const st = Math.max(0, at + p.length - full.length); return [map[st], map[end]]; }
      return [map[at], map[end]];
    }
  }
  return null;
}
for (const d of DATA) {
  if (globalThis.HP_ONLY && d.id !== globalThis.HP_ONLY) continue;
  for (const s of d.sources) {
    ST.done++;
    await Zotero.Promise.delay(150);
    try {
      const item = (s.doi && (await findByDOI(s.doi))) || (await findByTitle(s.title));
      if (!item) { ST.nopdf.push(d.id + " | not in library | " + s.title.slice(0, 50)); continue; }
      const att = item.getAttachments().map((id) => Zotero.Items.get(id)).find((a) => a.isPDFAttachment && a.isPDFAttachment() && a.isImportedAttachment());
      if (!att || !(await att.fileExists())) { ST.nopdf.push(d.id + " | " + (s.doi || s.title.slice(0, 50))); continue; }
      const existing = att.getAnnotations().some((a) => (a.annotationComment || "").includes(TAG));
      if (existing) { ST.already++; continue; }
      const rd = await Promise.race([Zotero.PDFWorker.getRecognizerData(att.id, true), new Promise((_, r) => setTimeout(() => r(new Error("timeout recognizer")), 60000))]);
      const pages = rd.pages || [];
      let hit = null;
      for (let pi = 0; pi < Math.min(pages.length, 4) && !hit; pi++) {
        const pg = pages[pi], W = pg[0], H = pg[1], words = [];
        collectWords(pg.slice(2), words);
        const loc = locate(words, s.highlight || "");
        if (loc) hit = { pi, W, H, words: words.slice(loc[0], loc[1] + 1) };
      }
      if (!ST.sample && pages.length) { const w0 = []; collectWords(pages[0].slice(2), w0); ST.sample = { W: pages[0][0], H: pages[0][1], n: pages.length, firstWords: w0.slice(0, 3) }; }
      if (!hit) { ST.notfound.push(d.id + " | " + (s.doi || s.title.slice(0, 50))); continue; }
      // merge words into one rect per line
      const lines = [];
      for (const w of hit.words) {
        const [x1, y1, x2, y2] = w;
        const ln = lines.find((l) => Math.abs((l[1] + l[3]) / 2 - (y1 + y2) / 2) < (y2 - y1) * 0.6);
        if (ln) { ln[0] = Math.min(ln[0], x1); ln[1] = Math.min(ln[1], y1); ln[2] = Math.max(ln[2], x2); ln[3] = Math.max(ln[3], y2); }
        else lines.push([x1, y1, x2, y2]);
      }
      const flip = globalThis.HP_FLIP !== false; // recognizer y runs top-down; PDF space runs bottom-up
      const rects = lines.map(([x1, y1, x2, y2]) => (flip ? [x1, hit.H - y2, x2, hit.H - y1] : [x1, y1, x2, y2]).map((v) => Math.round(v * 1000) / 1000));
      const top = flip ? hit.H - Math.max(...rects.map((r) => r[3])) : Math.min(...rects.map((r) => r[1]));
      const json = {
        key: Zotero.DataObjectUtilities.generateKey(), type: "highlight", color: "#ffd400",
        text: s.highlight, comment: TAG + " — " + d.title, pageLabel: String(hit.pi + 1),
        sortIndex: String(hit.pi).padStart(5, "0") + "|" + String(0).padStart(6, "0") + "|" + String(Math.max(0, Math.floor(top))).padStart(5, "0"),
        position: { pageIndex: hit.pi, rects }, tags: []
      };
      if (!globalThis.HP_DRY) await Zotero.Annotations.saveFromJSON(att, json);
      ST.highlighted++;
      if (!ST.lastRects) ST.lastRects = { id: d.id, att: att.id, rects, H: hit.H };
    } catch (e) { ST.errors.push(d.id + " " + (s.doi || "") + ": " + e); }
  }
}
ST.stage = "done";
return JSON.stringify(ST);
