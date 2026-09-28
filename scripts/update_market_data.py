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
           ("AVGO", "Broadcom"), ("AMD", "AMD"), ("NVDA", "Nvidia"), ("MU", "Micron (MU)"),
           ("FWDI", "Forward Industries (FWDI)"), ("DFDV", "DeFi Development (DFDV)"), ("UPXI", "Upexi (UPXI)"),
           ("MP", "MP Materials"), ("BZ=F", "Brent crude oil"),
           ("GC=F", "Gold (futures)"), ("SLV", "Silver (SLV)"), ("SILJ", "Junior silver miners (SILJ)"),
           ("UUUU", "Energy Fuels (UUUU)"), ("GLD", "Gold ETF (GLD)"), ("HG=F", "Copper (futures)"), ("ETH-USD", "Ethereum")]

TREASURY_ASOF = "2026-09-14"
# (ticker, name, shares outstanding, BTC held)
TREASURY = [(t, n, round(mc / p), q) for t, n, p, mc, q in [
    ("MTPLF", "Metaplanet", 1.79, 2405411848, 43000),
    ("MSTR", "Strategy", 160.85, 52690000000, 847666),
    ("MARA", "MARA Holdings", 12.37, 4779254919, 35577),
    ("CLSK", "CleanSpark", 13.73, 3511972523, 13703),
    ("RIOT", "Riot Platforms", 22.19, 8289693903, 11380),
    ("HUT", "Hut 8", 94.34, 11688689127, 10278),
    ("GLXY", "Galaxy Digital", 28.90, 11132000000, 6972),
    ("COIN", "Coinbase", 195.04, 51459592629, 17311),
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
    ("SKYA", "SkyAI", 2077799),
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

    for sym, name in TICKERS:
        try:
            data["prices"][sym] = {"name": name, "points": yahoo(sym)}
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
