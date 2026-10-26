// Zotero 7 "Run JavaScript" (async) helper for the Health Pyramid page.
// Stage 1: collections + items (by DOI) + summary notes + tags + open-access PDFs.
// Loaded by a one-line loader in Zotero; reads docs/health-pyramid/data.js from GitHub.
const DATA_URL = "https://raw.githubusercontent.com/tylerisyoung/website/" + (globalThis.HP_REF || "master") + "/docs/health-pyramid/data.js";
const lib = Zotero.Libraries.userLibraryID;
Zotero.HPabort = true; await Zotero.Promise.delay(100); Zotero.HPabort = false;
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout " + what)), ms))]);
const ST = (Zotero.HPstatus = { stage: "start", done: 0, total: 0, created: 0, existing: 0, manual: 0, pdf: 0, nopdf: [], errors: [] });

const txt = (await Zotero.HTTP.request("GET", DATA_URL + "?t=" + Date.now())).responseText;
const DATA = JSON.parse(txt.replace(/^window\.HP_DATA=/, "").replace(/;\s*$/, ""));
ST.total = DATA.reduce((n, d) => n + d.sources.length, 0);

async function getCol(name, parentID) {
  const all = Zotero.Collections.getByLibrary(lib, true);
  let c = all.find((x) => x.name === name && (x.parentID || null) === (parentID || null));
  if (c) { if (c.deleted) { c.deleted = false; await c.saveTx(); } return c; }
  c = new Zotero.Collection({ name, libraryID: lib });
  if (parentID) c.parentID = parentID;
  await c.saveTx();
  return c;
}
const root = await getCol("Health Pyramid");
const tierName = { supplements: "0 Supplements", daily: "1 Daily", weekly: "2 Weekly", monthly: "3 Monthly", annual: "4 Annual" };
const tierCol = {};
for (const t of Object.keys(tierName)) tierCol[t] = await getCol(tierName[t], root.id);

async function findByDOI(doi) {
  const s = new Zotero.Search(); s.libraryID = lib;
  s.addCondition("DOI", "is", doi);
  const ids = await s.search();
  return ids.length ? Zotero.Items.get(ids[0]) : null;
}
function setCreators(item, authors) {
  const out = [];
  (authors || "").replace(/,?\s*et al\.?/i, "").split(/,\s*/).forEach((a) => {
    a = a.trim(); if (!a) return;
    const m = a.match(/^(.+?)\s+([A-Z]{1,3})$/);
    out.push(m ? { lastName: m[1], firstName: m[2], creatorType: "author" } : { name: a, creatorType: "author", fieldMode: 1 });
  });
  item.setCreators(out);
}
async function importOne(s, colID) {
  if (s.doi) {
    const ex = await findByDOI(s.doi);
    if (ex) { ST.existing++; return ex; }
    try {
      const tr = new Zotero.Translate.Search();
      tr.setIdentifier({ DOI: s.doi });
      const trs = await withTimeout(tr.getTranslators(), 30000, "translators");
      if (trs.length) {
        tr.setTranslator(trs);
        const items = await withTimeout(tr.translate({ libraryID: lib, collections: [colID], saveAttachments: false }), 60000, "translate");
        if (items && items.length) { ST.created++; return items[0]; }
      }
    } catch (e) { ST.errors.push("translate " + s.doi + ": " + e); }
  }
  const it = new Zotero.Item("journalArticle");
  it.libraryID = lib;
  it.setField("title", s.title);
  if (s.journal) it.setField("publicationTitle", s.journal);
  if (s.year) it.setField("date", String(s.year));
  if (s.doi) it.setField("DOI", s.doi);
  if (s.url) it.setField("url", s.url);
  setCreators(it, s.authors);
  await it.saveTx();
  ST.manual++;
  return it;
}
const esc = (x) => String(x || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
for (const d of DATA) {
  if (Zotero.HPabort) { ST.stage = "aborted"; break; }
  const col = await getCol(d.title, tierCol[d.tier].id);
  for (const s of d.sources) {
    try {
      const item = await importOne(s, col.id);
      item.addToCollection(col.id);
      item.addTag("Health Pyramid");
      item.addTag("HP " + d.tier);
      item.addTag("HP " + d.label);
      if (s.type) item.addTag(s.type);
      await item.saveTx();
      const has = item.getNotes().map((id) => Zotero.Items.get(id)).some((n) => n.getNote().includes("Health Pyramid summary"));
      if (!has) {
        const n = new Zotero.Item("note"); n.libraryID = lib; n.parentID = item.id;
        n.setNote("<h2>Health Pyramid summary — " + esc(d.title) + "</h2><p>" + esc(s.summary) + "</p><p><b>Key finding:</b> <span style=\"background-color:#ffd40080\">" + esc(s.highlight) + "</span></p><p><a href=\"https://www.tylerisyoung.com/HealthPyramid.html#hp-" + d.id + "\">On the Health Pyramid page</a></p>");
        await n.saveTx();
      }
      const atts = item.getAttachments().map((id) => Zotero.Items.get(id)).filter((a) => a.isPDFAttachment && a.isPDFAttachment());
      if (!atts.length) {
        let a = null;
        try { a = await withTimeout((Zotero.Attachments.addAvailableFile || Zotero.Attachments.addAvailablePDF).call(Zotero.Attachments, item), 90000, "pdf"); } catch (e) { ST.errors.push("pdf " + s.doi + ": " + e); }
        if (a) ST.pdf++; else ST.nopdf.push(d.id + " | " + (s.doi || s.title));
      } else ST.pdf++;
    } catch (e) { ST.errors.push(d.id + " " + (s.doi || s.title) + ": " + e); }
    ST.done++;
  }
}
// tidy: trash item sub-collections that are no longer on the page (items stay in the library)
ST.trashedCollections = [];
for (const t of Object.keys(tierCol)) {
  const want = new Set(DATA.filter((d) => d.tier === t).map((d) => d.title));
  for (const c of Zotero.Collections.getByParent(tierCol[t].id)) {
    if (!want.has(c.name)) { ST.trashedCollections.push(tierName[t] + " / " + c.name); c.deleted = true; await c.saveTx(); }
  }
}
ST.stage = "done";
return JSON.stringify(ST);
