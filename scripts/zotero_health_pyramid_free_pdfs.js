// Zotero 7 "Run JavaScript" (async) helper, stage 3: find FREE, legal full-text PDFs for Health Pyramid
// sources that still have no PDF, attach them, then highlight the key finding (stage 2 script).
// Sources tried, in order: Europe PMC render (by PMCID), PMC, OpenAlex OA locations, Semantic Scholar openAccessPdf.
const REF = globalThis.HP_REF || "master";
const RAW = "https://raw.githubusercontent.com/tylerisyoung/website/" + REF + "/";
const lib = Zotero.Libraries.userLibraryID;
const ST = (Zotero.HPfree = { stage: "start", checked: 0, attached: 0, stillMissing: [], via: {}, errors: [] });
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout " + what)), ms))]);
const txt = (await Zotero.HTTP.request("GET", RAW + "docs/health-pyramid/data.js?t=" + Date.now())).responseText;
const DATA = JSON.parse(txt.replace(/^window\.HP_DATA=/, "").replace(/;\s*$/, ""));

async function findItem(s) {
  for (const [field, val] of [["DOI", s.doi], ["title", s.title]]) {
    if (!val) continue;
    const q = new Zotero.Search(); q.libraryID = lib; q.addCondition(field, "is", val);
    const ids = await q.search();
    const it = ids.map((id) => Zotero.Items.get(id)).find((x) => x.isRegularItem());
    if (it) return it;
  }
  return null;
}
async function hasPDF(item) {
  for (const id of item.getAttachments()) {
    const a = Zotero.Items.get(id);
    if (a.isPDFAttachment && a.isPDFAttachment() && (await a.fileExists())) return true;
  }
  return false;
}
async function getJSON(url) {
  const r = await withTimeout(Zotero.HTTP.request("GET", url, { responseType: "json", successCodes: false, headers: { Accept: "application/json" } }), 30000, "api");
  return r.status === 200 ? r.response : null;
}
async function candidates(s) {
  const out = [];
  if (s.pmcid) {
    out.push(["Europe PMC", "https://europepmc.org/articles/" + s.pmcid + "?pdf=render"]);
    out.push(["PMC", "https://pmc.ncbi.nlm.nih.gov/articles/" + s.pmcid + "/pdf/"]);
  }
  if (s.doi) {
    try {
      const w = await getJSON("https://api.openalex.org/works/doi:" + encodeURIComponent(s.doi));
      if (w) {
        const locs = [w.best_oa_location].concat(w.locations || []).filter((l) => l && l.pdf_url);
        for (const l of locs) out.push(["OpenAlex " + ((l.source && l.source.display_name) || l.landing_page_url || ""), l.pdf_url]);
        if (!s.pmcid && w.ids && w.ids.pmcid) {
          const p = String(w.ids.pmcid).split("/").pop();
          out.push(["Europe PMC", "https://europepmc.org/articles/" + p + "?pdf=render"]);
        }
      }
    } catch (e) {}
    try {
      const ss = await getJSON("https://api.semanticscholar.org/graph/v1/paper/DOI:" + encodeURIComponent(s.doi) + "?fields=openAccessPdf");
      if (ss && ss.openAccessPdf && ss.openAccessPdf.url) out.push(["Semantic Scholar", ss.openAccessPdf.url]);
    } catch (e) {}
  }
  const seen = new Set();
  return out.filter((c) => !seen.has(c[1]) && seen.add(c[1]));
}
for (const d of DATA) {
  for (const s of d.sources) {
    try {
      const item = await findItem(s);
      if (!item || (await hasPDF(item))) continue;
      ST.checked++;
      let ok = false;
      for (const [via, url] of await candidates(s)) {
        try {
          const att = await withTimeout(Zotero.Attachments.importFromURL({ libraryID: lib, url, parentItemID: item.id, contentType: "application/pdf", title: "Full Text PDF (" + via + ")" }), 90000, "download");
          if (att && att.isPDFAttachment() && (await att.fileExists())) { ok = true; ST.attached++; ST.via[via] = (ST.via[via] || 0) + 1; break; }
          if (att) await att.eraseTx(); // not a real PDF (login page etc.)
        } catch (e) {}
        await Zotero.Promise.delay(300);
      }
      if (!ok) ST.stillMissing.push(d.id + " | " + (s.doi || s.title.slice(0, 50)));
    } catch (e) { ST.errors.push(d.id + ": " + e); }
  }
}
ST.stage = "pdfs done";
// stage 2: highlight the newly attached PDFs (already-highlighted ones are skipped)
const hl = (await Zotero.HTTP.request("GET", RAW + "scripts/zotero_health_pyramid_highlight.js?t=" + Date.now())).responseText;
globalThis.HP_ONLY = null;
const H = JSON.parse(await eval("(async()=>{" + hl + "\n})()"));
ST.highlightedNow = H.highlighted; ST.highlightNotFound = H.notfound; ST.highlightErrors = H.errors;
ST.stage = "done";
return JSON.stringify(ST);
