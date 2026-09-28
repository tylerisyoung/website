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

# Treasury companies not already in TICKERS (price history for the Markets chart)
TREASURY_HIST = [("MTPLF", "Metaplanet (MTPLF)"), ("MARA", "MARA Holdings"), ("CLSK", "CleanSpark"),
                 ("RIOT", "Riot Platforms"), ("HUT", "Hut 8"), ("GLXY", "Galaxy Digital"), ("COIN", "Coinbase"),
                 ("SKYA", "SkyAI"), ("HSDT", "Solana Company (HSDT)")]
AUX = [("SI=F", "Silver (futures, $/oz)")]   # used only to convert silver targets to SLV

# Price targets for the "Current Best Buy" ranking. Edit here; the page recomputes everything.
#   kind "long":      long-range target (horizon = year, target reached by Dec 31 of that year)
#   kind "consensus": analyst 12-month consensus (horizon = 1 year) -- used where no long-range target exists
#   kind "nav":       treasury company, derived from its coin's long-range target (see page for method)
#   kind "proxy":     target given for an underlying (e.g. silver $/oz) converted at today's ratio
IA_SANDBAG = "InvestAnswers, 2030 \"PT Sandbag\" table (YouTube; screenshot provided by Tyler, video not confirmed)"
TARGETS = {
    "BTC-USD": {"kind": "long", "horizon": 2030, "low": 300000, "base": 666391, "high": 1200000, "sources": [
        [IA_SANDBAG, "2030 $622,782", ""],
        ["ARK Invest, Bitcoin 2030 price target (Apr 24, 2025)", "bear $300k / base $710k / bull $1.5M", "https://www.ark-invest.com/articles/valuation-models/arks-bitcoin-price-target-2030"],
        ["ARK Big Ideas 2026 (Jan 21, 2026)", "$16T market cap, about $780k per coin", "https://finance.yahoo.com/news/cathie-wood-ark-invest-forecasts-043459274.html"],
        ["Standard Chartered (Dec 9, 2025; kept Feb 12, 2026)", "2030 $500k", "https://www.coindesk.com/markets/2026/02/12/standard-chartered-sees-bitcoin-sliding-to-usd50-000-ether-to-usd1-400-before-recovery"],
        ["Cathie Wood on CNBC (Nov 2025)", "bull case trimmed to about $1.2M (used as high)", ""]]},
    "ETH-USD": {"kind": "long", "horizon": 2030, "low": 360, "base": 31000, "high": 154000, "sources": [
        ["Standard Chartered (Jan 12, 2026; kept Jun 2026)", "2030 $40,000", "https://www.coindesk.com/markets/2026/01/12/standard-chartered-predicts-ether-will-outperform-bitcoin-hit-usd40-000-by-2030"],
        ["VanEck (Jun 5, 2024)", "bear $360 / base $22,000 / bull $154,000", "https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-eth-2030-price-target/"]]},
    "SOL-USD": {"kind": "long", "horizon": 2030, "low": 9.81, "base": 2000, "high": 3211, "sources": [
        [IA_SANDBAG, "2030 $2,153", ""],
        ["Standard Chartered (Feb 3, 2026)", "2030 $2,000", "https://www.dlnews.com/articles/markets/solana-price-target-dropped-in-2025-but-raised-for-2030-standard-chartered/"],
        ["VanEck (Oct 27, 2023)", "bear $9.81 / base $334.70 / bull $3,211", "https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-vanecks-base-bear-bull-case-solana-valuation-by-2030/"]]},
    "TSLA": {"kind": "long", "horizon": 2030, "low": 2000, "base": 2600, "high": 4794, "sources": [
        [IA_SANDBAG, "2030 $4,794", ""],
        ["InvestAnswers Substack (Nov 1, 2025)", "2030 $2,567 from robotaxi alone", "https://investanswers.substack.com/p/teslas-robotaxi-ramp"],
        ["ARK Invest, Tesla 2029 model (Jun 12, 2024)", "bear $2,000 / base $2,600 / bull $3,100 (2029)", "https://www.ark-invest.com/articles/valuation-models/arks-tesla-price-target-2029"]]},
    "SPCX": {"kind": "long", "horizon": 2030, "low": 125, "base": 184, "high": 229, "sources": [
        ["ARK Invest, SpaceX 2030 expected value (Jun 10, 2025)", "enterprise value $1.7T / $2.5T / $3.1T, divided by 13.56B shares", "https://www.ark-invest.com/articles/valuation-models/ark-expected-value-spacex-2030"]]},
    "SPY": {"kind": "long", "horizon": 2029, "low": 998, "base": 998, "high": 998, "sources": [
        ["Ed Yardeni (Jun 16, 2026)", "S&P 500 10,000 by 2029 (SPY is about S&P / 10.02)", "https://www.benzinga.com/markets/market-summary/26/06/53215138/"]]},
    "GC=F": {"kind": "long", "horizon": 2030, "low": 4500, "base": 5050, "high": 5600, "sources": [
        ["Bernstein (Sep 2026)", "2030 $5,600/oz (cut from $6,100)", "https://www.investing.com/news/commodities-news/bernstein-unveils-new-gold-price-forecast-for-2030-4908919"],
        ["JPMorgan (Feb 2026)", "long-term $4,500/oz (no year)", "https://www.thestreet.com/investing/jpmorgan-revamps-long-term-gold-price-target"]]},
    "SLV": {"kind": "proxy", "of": "SI=F", "horizon": 2027, "low": 63.90, "base": 63.90, "high": 63.90, "sources": [
        ["JPMorgan (Aug 13, 2026)", "silver 2027 average $63.90/oz (no institutional 2030 target found)", "https://www.jpmorgan.com/insights/global-research/commodities/silver-prices"]]},
    "HG=F": {"kind": "long", "horizon": 2030, "low": 6.80, "base": 7.17, "high": 7.17, "sources": [
        ["BMI / Fitch (Jul 16, 2026)", "2030 $15,800/t, about $7.17/lb", "https://www.mining.com/copper-price-bmi-hikes-forecasts-structural-deficits-to-bring-17000-next-decade/"],
        ["Goldman Sachs (2025/26)", "2035 $15,000/t, about $6.80/lb", "https://www.goldmansachs.com/insights/articles/copper-prices-forecast-to-decline-from-record-highs-in-2026"]]},
    "BZ=F": {"kind": "long", "horizon": 2027, "low": 62, "base": 62, "high": 62, "sources": [
        ["JPMorgan", "Brent in the low $60s from 2H 2027 (no 2030 target found)", "https://www.jpmorgan.com/insights/global-research/commodities/oil-prices"]]},
    "MSTR": {"kind": "nav", "coin": "BTC-USD", "extra": [2489], "sources": [
        [IA_SANDBAG, "2030 $2,489 (averaged with the NAV-derived base)", ""],
        ["Nasdaq consensus (Sep 2026, 12-month)", "avg $226.85 ($136-$435); Bernstein $350 (Aug 26, 2026)", "https://www.nasdaq.com/market-activity/stocks/mstr/analyst-research"]]},
    "MTPLF": {"kind": "nav", "coin": "BTC-USD", "sources": [["MarketScreener (Tokyo 3350)", "2 analysts, avg 596 yen (not used)", ""]]},
    "FWDI": {"kind": "nav", "coin": "SOL-USD", "sources": [["Nasdaq consensus (12-month)", "avg $13.50 ($11-$16), 2 analysts", "https://www.nasdaq.com/market-activity/stocks/fwdi/analyst-research"]]},
    "DFDV": {"kind": "nav", "coin": "SOL-USD", "sources": [["Nasdaq consensus (12-month)", "$10.40, 1 analyst", "https://www.nasdaq.com/market-activity/stocks/dfdv/analyst-research"]]},
    "UPXI": {"kind": "nav", "coin": "SOL-USD", "sources": [["Nasdaq consensus (12-month)", "$2.00, 1 analyst", "https://www.nasdaq.com/market-activity/stocks/upxi/analyst-research"]]},
    "SKYA": {"kind": "nav", "coin": "SOL-USD", "sources": []},
    "HSDT": {"kind": "nav", "coin": "SOL-USD", "sources": [["Nasdaq consensus (12-month)", "avg $3.50 ($3-$4), 2 analysts", "https://www.nasdaq.com/market-activity/stocks/hsdt/analyst-research"]]},
}
for t, avg, lo, hi in [("COIN", 206.15, 95, 330), ("NVDA", 324.32, 275, 465), ("AVGO", 519.21, 350, 630),
                       ("AMD", 648.07, 465, 1250), ("MU", 1490.23, 1100, 2000), ("UUUU", 24.15, 16, 32.5),
                       ("MP", 72.00, 57, 85), ("GLXY", 37.90, 26, 50), ("MARA", 15.11, 10, 27),
                       ("RIOT", 33.54, 22, 43), ("CLSK", 23.85, 21, 26), ("HUT", 161.47, 96, 273)]:
    TARGETS[t] = {"kind": "consensus", "horizon": "12m", "low": lo, "base": avg, "high": hi, "sources": [
        ["Nasdaq analyst consensus (as of Sep 1, 2026)", "12-month avg $%s (low $%s, high $%s); no 2030 target found" % (avg, lo, hi),
         "https://www.nasdaq.com/market-activity/stocks/%s/analyst-research" % t.lower()]]}

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
