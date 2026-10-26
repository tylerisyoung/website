// Zotero 7 "Run JavaScript" (async): full Health Pyramid sync.
// 1) stage 1: collections/items/notes/tags/OA PDFs for every source on the page (existing items are reused),
//    and sub-collections for removed pyramid items are moved to the trash (items stay in the library);
// 2) stage 3: free legal PDFs for sources still missing one, then highlights (stage 2).
// Progress: Zotero.HPupd (and Zotero.HPstatus / Zotero.HPfree / Zotero.HPhl).
const RAW = "https://raw.githubusercontent.com/tylerisyoung/website/" + (globalThis.HP_REF || "master") + "/scripts/";
const U = (Zotero.HPupd = { stage: "stage1" });
const run = async (f) => JSON.parse(await eval("(async()=>{" + (await Zotero.HTTP.request("GET", RAW + f + "?t=" + Date.now())).responseText + "\n})()"));
const s1 = await run("zotero_health_pyramid.js");
U.stage1 = { created: s1.created, existing: s1.existing, manual: s1.manual, pdf: s1.pdf, nopdf: s1.nopdf.length, errors: s1.errors, trashedCollections: s1.trashedCollections };
U.stage = "free pdfs + highlights";
const s3 = await run("zotero_health_pyramid_free_pdfs.js");
U.stage3 = { checked: s3.checked, attached: s3.attached, stillMissing: s3.stillMissing.length, highlightedNow: s3.highlightedNow, highlightNotFound: (s3.highlightNotFound || []).length, errors: s3.errors.concat(s3.highlightErrors || []) };
U.stage = "done";
return JSON.stringify(U);
