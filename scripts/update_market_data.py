#!/usr/bin/env python3
"""Fetch the Financial Dashboard data (no API keys needed) and write docs/data/markets.json.

Prices: Yahoo Finance daily closes. Macro: FRED public CSV downloads.
Run locally (python3 scripts/update_market_data.py) or by the daily GitHub Action.
"""
import csv, io, json, os, sys, time, urllib.request, urllib.parse, datetime as dt

UA_YAHOO = {"User-Agent": "Mozilla/5.0"}
UA_FRED = {"User-Agent": "curl/8.0"}   # FRED rejects browser-like agents from scripts
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "data", "markets.json")

TICKERS = [("BTC-USD", "Bitcoin"), ("SPY", "S&P 500 (SPY)"),
           ("SOL-USD", "Solana"), ("MSTR", "Strategy (MSTR)"), ("TSLA", "Tesla"), ("SPCX", "SpaceX (SPCX)"),
           ("AVGO", "Broadcom"), ("NVDA", "Nvidia"), ("MU", "Micron (MU)"),
           ("FWDI", "Forward Industries (FWDI)"), ("DFDV", "DeFi Development (DFDV)"), ("UPXI", "Upexi (UPXI)"),
           ("MP", "MP Materials"), ("GC=F", "Gold (futures)"), ("SLV", "Silver (SLV)"), ("SILJ", "Junior silver miners (SILJ)"),
           ("UUUU", "Energy Fuels (UUUU)"), ("GLD", "Gold ETF (GLD)"), ("HG=F", "Copper (futures)"), ("ETH-USD", "Ethereum")]

TREASURY_ASOF = "2026-09-14"
# (ticker, name, shares outstanding, BTC held)
TREASURY = [(t, n, round(mc / p), q) for t, n, p, mc, q in [
    ("MTPLF", "Metaplanet", 1.79, 2405411848, 43000),
    ("MSTR", "Strategy", 160.85, 52690000000, 847666),
    ("SPCX", "SpaceX", 146.82, 1990861138189, 18712),
    ("TSLA", "Tesla", 359.59, 1421876454039, 11509),
]]

# Solana treasury companies: (ticker, name, SOL held). Holdings from CoinGecko's Solana
# treasury list (2026-09-28); share counts are fetched from Yahoo Finance on each run.
SOL_TREASURY_ASOF = "2026-09-28"
SOL_TREASURY = [
    ("FWDI", "Forward Industries", 7550000),
    ("DFDV", "DeFi Development", 2490304),
    ("UPXI", "Upexi", 2173204),
    ("HSDT", "Solana Company", 2064717),
]

def yahoo_shares(symbols):
    """Shares outstanding from Yahoo's quote API (needs a session cookie and crumb)."""
    import http.cookiejar
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    try: op.open(urllib.request.Request("https://fc.yahoo.com", headers=UA_YAHOO), timeout=20)
    except Exception: pass
    crumb = op.open(urllib.request.Request("https://query1.finance.yahoo.com/v1/test/getcrumb", headers=UA_YAHOO), timeout=20).read().decode()
    u = ("https://query1.finance.yahoo.com/v7/finance/quote?fields=sharesOutstanding&symbols="
         + ",".join(symbols) + "&crumb=" + urllib.parse.quote(crumb))
    j = json.loads(op.open(urllib.request.Request(u, headers=UA_YAHOO), timeout=20).read())
    return {q["symbol"]: q.get("sharesOutstanding") for q in j["quoteResponse"]["result"]}

# Treasury companies not already in TICKERS (price history for the Markets chart)
TREASURY_HIST = [("MTPLF", "Metaplanet (MTPLF)"), ("HSDT", "Solana Company (HSDT)")]
AUX = [("SI=F", "Silver (futures, $/oz)")]   # used only to convert silver targets to SLV

# Price targets for the "Current Best Buy" ranking (checked 2026-09-28).
# Rules: base cases only (no bear/bull scenarios); forecasters are analysts/firms, not media in-house
# estimates; published within the last two years; at least 3 forecasters per ranked asset.
# Range = lowest to highest base case; median = median of base cases; n = number of forecasters.
#   kind "long": horizon year;  "consensus": 12-month analyst consensus (n = analyst count, MarketBeat);
#   "nav": treasury company derived from its coin's target;  "proxy": underlying target converted at today's ratio.
import statistics
def T(kind, horizon, srcs, ia=None, **kw):
    """ia = the InvestAnswers target from Tyler's photo: weighted 50%, the other forecasters' average 50%."""
    b = [v for _, v in srcs] + ([ia] if ia else [])
    base = 0.5 * ia + 0.5 * statistics.mean([v for _, v in srcs]) if ia else statistics.median(b)
    d = {"kind": kind, "horizon": horizon, "n": len(b), "low": min(b), "base": round(base, 4),
         "high": max(b), "by": [x[0] for x in srcs] + (["InvestAnswers (50% weight)"] if ia else [])}
    d.update(kw); return d
def C(n, avg, lo, hi, **kw):
    d = {"kind": "consensus", "horizon": "12m", "n": n, "low": lo, "base": avg, "high": hi, "by": ["%d analysts" % n]}
    d.update(kw); return d
SPX = 10.02   # SPY is about the S&P 500 divided by 10.02
TARGETS = {
    # BTC: InvestAnswers 2030 "sandbag" table (Tyler's screenshot), ARK Big Ideas 2026 base, Standard Chartered end-2030,
    #      Willy Woo River-model range $220k-600k for 2029-31 (midpoint)
    "BTC-USD": T("long", 2030, [("ARK Invest", 710000), ("Standard Chartered", 500000), ("Willy Woo", 410000)], ia=622782),
    # ETH: Standard Chartered 2030; Bitwise "$10k+ by end of decade" (Nov 2025); Finder panel end-2030 (May 2026)
    "ETH-USD": T("long", 2030, [("Standard Chartered", 40000), ("Bitwise", 10000), ("Finder expert panel", 8488)]),
    # SOL: InvestAnswers 2030; Standard Chartered 2030; Finder panel end-2030 (Apr 2025)
    "SOL-USD": T("long", 2030, [("Standard Chartered", 2000), ("Finder expert panel", 892)], ia=2153),
    # S&P 500: Yardeni 10,000 end-2029; Trivariate 10,000 by 2030; Sanctuary 10,000-13,000 by 2030 (midpoint)
    "SPY": T("long", 2030, [("Yardeni", round(10000 / SPX, 2)), ("Trivariate", round(10000 / SPX, 2)), ("Sanctuary Wealth", round(11500 / SPX, 2))]),
    # Gold $/oz: Bernstein 2030 (Sep 2026); Yardeni end-2029; JPMorgan long-term
    "GC=F": T("long", 2030, [("Bernstein", 5600), ("Yardeni", 10000), ("JPMorgan", 4500)]),
    # Silver $/oz, 2027: UBS Sep-2027; HSBC 2027 avg; BofA Q2-2027; OCBC Sep-2027 ($64-74 midpoint, Jul 2026); JPMorgan 2027 avg
    # (no credible 2030 silver forecasts exist; banks stop at 2027. World Bank 2027 avg; Macquarie end-2027 added)
    "SLV": T("proxy", 2027, [("UBS", 80), ("HSBC", 68), ("BofA", 75), ("OCBC", 69), ("JPMorgan", 63.90), ("World Bank", 65), ("Macquarie", 65)], of="SI=F"),
    # Copper $/lb, 2030 / long-term: BMI $15,800/t (2030); Goldman $12,250/t (2030); JPMorgan $12,000/t (next-decade avg);
    # Macquarie $10,200/t (long-term, 2025 dollars)
    # + UBS LT $5.50/lb (May 2026), Jefferies 2030-31 peak $8.00, Bernstein 2030 $10,700/t, Scotiabank LT $4.50,
    #   Australia Resources & Energy Quarterly FY2030-31 $12,233/t (Jun 2026)
    "HG=F": T("long", 2030, [("BMI / Fitch", 7.17), ("Goldman Sachs", 5.56), ("JPMorgan", 5.44), ("Macquarie", 4.63), ("UBS", 5.50),
                             ("Jefferies", 8.00), ("Bernstein", 4.85), ("Scotiabank", 4.50), ("Australia REQ", 5.55)]),
    # Uranium $/lb (sector outlook for UUUU): Morgans ~$100 FY29 / $105-110 FY31 (2030 ~ $102.5); Jefferies LT $95;
    # Macquarie base $95; Shaw and Partners LT $120; Bell Potter LT $90. Spot $89.50 (Trading Economics, Sep 25, 2026)
    "URANIUM": T("sector", 2030, [("Morgans", 102.5), ("Jefferies", 95), ("Macquarie", 95), ("Shaw and Partners", 120), ("Bell Potter", 90)], spot=89.50),
    # TSLA 2030: InvestAnswers $4,794 (50% weight); ARK 2029 base $2,600; Ron Baron (2026) "$2,000 or $2,500" (midpoint)
    "TSLA": T("long", 2030, [("ARK Invest", 2600), ("Baron Capital", 2250)], ia=4794, c12=411.89, c12n=46),
    "SPCX": C(44, 219.24, 75, 800),
    "MSTR": {"kind": "nav", "coin": "BTC-USD", "extra": [2489], "c12": 239.88, "c12n": 19},
    "MTPLF": {"kind": "nav", "coin": "BTC-USD"},
    "FWDI": {"kind": "nav", "coin": "SOL-USD", "c12": 12.50, "c12n": 5},
    "DFDV": {"kind": "nav", "coin": "SOL-USD"},
    "UPXI": {"kind": "nav", "coin": "SOL-USD"},
    "HSDT": {"kind": "nav", "coin": "SOL-USD", "c12": 3.25, "c12n": 4},
    "UUUU": C(7, 21.85, 16, 29.25), "MP": C(17, 76.29, 57, 112),
    "NVDA": C(55, 324.14, 218, 515),
    "AVGO": C(41, 527.20, 350, 715), "MU": C(45, 1348, 300, 2000),
}
assert all(v.get("n", 3) >= 3 for v in TARGETS.values())

def get(url, headers, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                return r.read().decode()
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(3 * (i + 1))

def yahoo(sym):
    j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=10y&interval=1d", UA_YAHOO))
    r = j["chart"]["result"][0]
    ts, cl = r["timestamp"], r["indicators"]["quote"][0]["close"]
    pts = [[dt.datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"), round(c, 4 if c < 10 else 2)] for t, c in zip(ts, cl) if c is not None]
    return pts

def fred(series):
    rows = list(csv.reader(io.StringIO(get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}", UA_FRED))))[1:]
    out = []
    for d, v in rows:
        try: out.append([d, float(v)])
        except ValueError: pass
    return out

def since(pts, year=2000):
    return [p for p in pts if int(p[0][:4]) >= year]

def main():
    old = {}
    if os.path.exists(OUT):
        try: old = json.load(open(OUT))
        except Exception: old = {}
    data = {"updated": dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"), "prices": {}, "macro": {}}

    for sym, name, group in [(a, b, None) for a, b in TICKERS] + [(a, b, "treasury") for a, b in TREASURY_HIST] + [(a, b, "aux") for a, b in AUX]:
        try:
            data["prices"][sym] = {"name": name, "points": yahoo(sym)}
            if group: data["prices"][sym]["group"] = group
        except Exception as e:
            print("price failed", sym, e, file=sys.stderr)
            if sym in old.get("prices", {}): data["prices"][sym] = old["prices"][sym]

    try:
        cpi = fred("CPIAUCSL")
        yoy = [[cpi[i][0], round((cpi[i][1] / cpi[i - 12][1] - 1) * 100, 2)] for i in range(12, len(cpi))]
        base = [v for d, v in cpi if d.startswith("2020-01")][0]
        cum = [[d, round((v / base - 1) * 100, 2)] for d, v in cpi if d >= "2020-01"]
        pay = fred("PAYEMS")
        chg = [[pay[i][0], round(pay[i][1] - pay[i - 1][1], 0)] for i in range(1, len(pay))]
        m2 = [[d, round(v / 1000, 3)] for d, v in fred("M2SL")]                  # $ trillions
        gdp_real = [[d, round(v / 1000, 3)] for d, v in fred("GDPC1")]           # $ trillions (2017 dollars)
        debt = {d: v / 1e6 for d, v in fred("GFDEBTN")}                           # millions -> $ trillions
        gdp_nom = {d: v / 1e3 for d, v in fred("GDP")}                            # billions -> $ trillions
        dtg = [[d, round(debt[d] / gdp_nom[d] * 100, 1)] for d in sorted(debt) if d in gdp_nom]
        walcl = [[d, round(v / 1e6, 3)] for d, v in fred("WALCL")]              # millions -> $ trillions
        icsa = [[d, round(v / 1000, 1)] for d, v in fred("ICSA")]               # thousands
        data["macro"] = {
            "fedfunds": {"name": "Federal funds rate", "unit": "%", "points": since(fred("FEDFUNDS"))},
            "dgs10":    {"name": "10-year Treasury yield", "unit": "%", "points": since(fred("DGS10"))},
            "walcl":    {"name": "Fed balance sheet (total assets)", "unit": "$T", "points": since(walcl)},
            "icsa":     {"name": "Initial jobless claims (weekly)", "unit": "thousands", "points": since(icsa)},
            "cpi_yoy":  {"name": "CPI inflation (year over year)", "unit": "%", "points": since(yoy)},
            "shadow":   {"name": "ShadowStats-style alternate inflation (estimate)", "unit": "% y/y; official CPI + 7 pts, the typical gap to ShadowStats' 1980-method series since the late 1990s (Saville, TSI 2015)", "points": [[d, round(v + 7, 2)] for d, v in since(yoy)]},
            "cpi_cum":  {"name": "Prices up since January 2020 (CPI, cumulative)", "unit": "% rise in the consumer price level", "points": cum},
            "real_gdp": {"name": "Real GDP", "unit": "$T (2017 dollars, annual rate)", "points": since(gdp_real)},
            "unrate":   {"name": "Unemployment rate", "unit": "%", "points": since(fred("UNRATE"))},
            "m2":       {"name": "M2 money supply", "unit": "$T", "points": since(m2)},
            "payrolls": {"name": "Nonfarm payrolls, monthly change", "unit": "thousands of jobs", "points": since(chg, 2010)},
            "debt":     {"name": "Federal debt", "unit": "$T", "points": [[d, round(v, 3)] for d, v in sorted(debt.items()) if int(d[:4]) >= 2000]},
            "dgs30":    {"name": "30-year Treasury yield", "unit": "%", "points": since(fred("DGS30"))},
            "dgs2":     {"name": "2-year Treasury yield", "unit": "%", "points": since(fred("DGS2"))},
            "t10y2y":   {"name": "10-year minus 2-year Treasury spread", "unit": "percentage points", "points": since(fred("T10Y2Y"))},
            "debt_gdp": {"name": "Federal debt to GDP", "unit": "%", "points": since(dtg)},
        }
    except Exception as e:
        print("macro failed", e, file=sys.stderr)
        data["macro"] = old.get("macro", {})

    # Bitcoin treasury companies. BTC held and share counts: InvestAnswers model, 2026-09-14
    # (shares = that model's market cap / share price). Edit TREASURY to update holdings.
    tre = {"holdings_asof": TREASURY_ASOF, "sol_asof": SOL_TREASURY_ASOF, "rows": []}
    olds = {r["t"]: r for r in old.get("treasury", {}).get("rows", [])}
    for t, name, shares, qty in TREASURY:
        row = {"t": t, "name": name, "coin": "BTC", "shares": shares, "qty": qty, "price": None}
        try:
            j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?range=5d&interval=1d", UA_YAHOO))
            row["price"] = round(j["chart"]["result"][0]["meta"]["regularMarketPrice"], 4)
        except Exception as e:
            print("treasury price failed", t, e, file=sys.stderr)
            if t in olds: row["price"] = olds[t]["price"]
        tre["rows"].append(row)
    try: sh = yahoo_shares([t for t, _, _ in SOL_TREASURY])
    except Exception as e:
        print("sol shares failed", e, file=sys.stderr); sh = {}
    for t, name, qty in SOL_TREASURY:
        row = {"t": t, "name": name, "coin": "SOL", "shares": sh.get(t) or olds.get(t, {}).get("shares"), "qty": qty, "price": None}
        try:
            j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?range=5d&interval=1d", UA_YAHOO))
            row["price"] = round(j["chart"]["result"][0]["meta"]["regularMarketPrice"], 4)
        except Exception as e:
            print("treasury price failed", t, e, file=sys.stderr)
            if t in olds: row["price"] = olds[t]["price"]
        tre["rows"].append(row)
    data["treasury"] = tre

    data["targets"] = TARGETS

    # Debt clock: latest Treasury "Debt to the Penny" figure and the one about a year earlier
    try:
        u = ("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny"
             "?fields=record_date,tot_pub_debt_out_amt&sort=-record_date&page%5Bsize%5D=260")
        rows = json.loads(get(u, {"User-Agent": "curl/8.0"}))["data"]
        data["debt_clock"] = {"latest": [rows[0]["record_date"], float(rows[0]["tot_pub_debt_out_amt"])],
                              "year_ago": [rows[-1]["record_date"], float(rows[-1]["tot_pub_debt_out_amt"])]}
    except Exception as e:
        print("debt clock failed", e, file=sys.stderr)
        if "debt_clock" in old: data["debt_clock"] = old["debt_clock"]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f: json.dump(data, f, separators=(",", ":"))
    print("wrote", OUT, os.path.getsize(OUT), "bytes;", len(data["prices"]), "prices,", len(data["macro"]), "macro series")

if __name__ == "__main__":
    main()
