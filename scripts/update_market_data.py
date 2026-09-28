#!/usr/bin/env python3
"""Fetch the Financial Dashboard data (no API keys needed) and write docs/data/markets.json.

Prices: Yahoo Finance daily closes. Macro: FRED public CSV downloads.
Run locally (python3 scripts/update_market_data.py) or by the daily GitHub Action.
"""
import csv, io, json, os, sys, time, urllib.request, datetime as dt

UA_YAHOO = {"User-Agent": "Mozilla/5.0"}
UA_FRED = {"User-Agent": "curl/8.0"}   # FRED rejects browser-like agents from scripts
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "data", "markets.json")

TICKERS = [("BTC-USD", "Bitcoin"), ("SPY", "S&P 500 (SPY)"),
           ("SOL-USD", "Solana"), ("MSTR", "Strategy (MSTR)"), ("TSLA", "Tesla"), ("SPCX", "SpaceX (SPCX)"),
           ("AVGO", "Broadcom"), ("AMD", "AMD"), ("NVDA", "Nvidia"), ("MU", "Micron (MU)"),
           ("FWDI", "Forward Industries (FWDI)"), ("DFDV", "DeFi Development (DFDV)"), ("UPXI", "Upexi (UPXI)"),
           ("MP", "MP Materials"), ("BZ=F", "Brent crude oil"),
           ("GC=F", "Gold (futures)"), ("SLV", "Silver (SLV)"), ("SILJ", "Junior silver miners (SILJ)"),
           ("UUUU", "Energy Fuels (UUUU)"), ("CCJ", "Cameco (CCJ)"), ("ETH-USD", "Ethereum")]

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
