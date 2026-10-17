"""Build docs/learn/data.json for the Learn page.

Reads the Health Pyramid sources (docs/health-pyramid/data.js), the Policy
Priorities dashboard (docs/policy-dashboard/data.json) and its ranked verdict
table (datascience.Rmd). Re-run after either dashboard changes:

    python3 scripts/build_learn_data.py
"""
import difflib
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")


def clean(s):
    s = html.unescape(re.sub(r"<[^>]+>", "", str(s or "")))
    s = re.sub(r"\*\*?([^*]+)\*\*?", r"\1", s)
    return re.sub(r"\s+", " ", s).strip()


def first_sentences(s, n=2):
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", clean(s))
    return " ".join(parts[:n])


def quotes(s):
    # Direct quotes from studies, as cited in the essays
    out = []
    for q in re.findall(r"“([^”]{40,400})”|\"([^\"]{40,400})\"", str(s or "")):
        q = clean(q[0] or q[1])
        if q and q not in out:
            out.append(q)
    return out


# ---------- Health ----------
src = open(os.path.join(DOCS, "health-pyramid", "data.js"), encoding="utf-8").read().strip()
src = re.sub(r"^window\.HP_DATA\s*=\s*", "", src).rstrip(";")
hp = json.loads(src)
tier_names = {"supplements": "Supplements", "daily": "Daily", "weekly": "Weekly", "monthly": "Monthly", "annual": "Annual"}
health_topics, health_studies = [], []
for item in hp:
    health_topics.append({
        "id": item["id"], "label": clean(item.get("title") or item.get("label")),
        "tier": tier_names.get(item.get("tier"), item.get("tier")), "blurb": clean(item.get("blurb")),
    })
    for i, s in enumerate(item.get("sources", [])):
        health_studies.append({
            "id": f"{item['id']}-{i}", "topic": item["id"], "title": clean(s.get("title")),
            "authors": clean(s.get("authors")), "year": s.get("year"), "journal": clean(s.get("journal")),
            "type": clean(s.get("type")), "summary": clean(s.get("summary")), "quote": clean(s.get("highlight")),
            "url": s.get("url") or (f"https://doi.org/{s['doi']}" if s.get("doi") else ""),
        })

# ---------- BCR ----------
pd = json.load(open(os.path.join(DOCS, "policy-dashboard", "data.json"), encoding="utf-8"))
rmd = open(os.path.join(ROOT, "datascience.Rmd"), encoding="utf-8").read()
verdicts = []
for row in re.findall(r"<tr><td[^>]*>(\d+)</td><td[^>]*>(.*?)</td><td[^>]*>(.*?)</td><td>(.*?)</td></tr>", rmd):
    verdicts.append({"rank": int(row[0]), "name": clean(row[1]), "verdict": clean(row[2]), "why": clean(row[3])})

titles = {p["id"]: clean(p["title"]) for p in pd["policies"]}
by_title = {v.lower(): k for k, v in titles.items()}
sources_by_policy = {}
for s in pd["sources"]:
    sources_by_policy.setdefault(s["policy_id"], []).append(s)

type_rank = {"peer_reviewed": 0, "working_paper": 1, "intl_org": 2, "government": 3, "book": 4, "think_tank": 5, "media": 6, "": 7}


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


policies = []
for v in verdicts:
    match = difflib.get_close_matches(v["name"].lower(), list(by_title), n=1, cutoff=0.4)
    pid = by_title[match[0]] if match else None
    p = next((x for x in pd["policies"] if x["id"] == pid), {})
    essay = pd["essays"].get(pid, {}) if pid else {}
    srcs = sorted(sources_by_policy.get(pid, []), key=lambda s: (s["role"] != "evidence", type_rank.get(s["type"], 9)))
    key_studies = [{
        "authors": clean(s["authors"]), "year": s["year"], "title": clean(s["title"]), "venue": clean(s["venue"]),
        "type": s["type"], "role": s["role"], "finding": clean(s["reported_estimate"]), "url": s.get("url") or "",
    } for s in srcs if clean(s.get("reported_estimate"))][:6]
    q = []
    for k in ("evidence", "counter", "ratio", "policy", "why_on_list"):
        q += [{"text": t, "section": k} for t in quotes(essay.get(k))]
    policies.append({
        "rank": v["rank"], "name": v["name"], "verdict": v["verdict"], "why": v["why"],
        "category": p.get("category", ""), "bcr_low": num(p.get("bcr_low")), "bcr_high": num(p.get("bcr_high")),
        "grade": p.get("grade", ""), "grade_reason": first_sentences(p.get("grade_reason"), 2),
        "cost_bn": num(p.get("cost_bn")), "difficulty": p.get("difficulty", ""),
        "difficulty_reason": first_sentences(p.get("difficulty_reason"), 1),
        "who_benefits": p.get("who_benefits", ""), "who_benefits_reason": first_sentences(p.get("who_benefits_reason"), 1),
        "summary": first_sentences(p.get("summary"), 3), "selected_by": clean(p.get("selected_by")),
        "evidence": first_sentences(essay.get("evidence"), 3), "ratio": first_sentences(essay.get("ratio"), 3),
        "counter": first_sentences(essay.get("counter"), 2), "key_studies": key_studies, "quotes": q[:4],
        "n_sources": len(sources_by_policy.get(pid, [])),
    })

out = {
    "built": __import__("datetime").date.today().isoformat(),
    "health": {"topics": health_topics, "studies": health_studies},
    "bcr": {"policies": policies, "n_sources": len(pd["sources"]), "n_draws": len(pd["draws"])},
}
os.makedirs(os.path.join(DOCS, "learn"), exist_ok=True)
with open(os.path.join(DOCS, "learn", "data.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
unmatched = [p["name"] for p in policies if not p["category"]]
print(f"health: {len(health_topics)} topics, {len(health_studies)} studies | bcr: {len(policies)} policies, "
      f"{sum(len(p['quotes']) for p in policies)} quotes | unmatched: {unmatched}")
