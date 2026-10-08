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
           ("AVGO", "Broadcom"), ("NVDA", "Nvidia"), ("MU", "Micron (MU)"), ("MRVL", "Marvell Technology (MRVL)"),
           ("FWDI", "Forward Industries (FWDI)"), ("DFDV", "DeFi Development (DFDV)"), ("UPXI", "Upexi (UPXI)"),
           ("MP", "MP Materials"), ("GC=F", "Gold (futures)"), ("SLV", "Silver (SLV)"), ("SILJ", "Junior silver miners (SILJ)"),
           ("UUUU", "Energy Fuels (UUUU)"), ("URNM", "Uranium miners ETF (URNM)"), ("YCA", "Yellow Cake (YCA, London, in USD)"), ("HG=F", "Copper (futures)"), ("CPER", "Copper ETF (CPER)"), ("ETH-USD", "Ethereum")]

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

# Balance sheets for "mNAV incl. debt" = (market cap + debt + preferred - cash) / coin value. USD, latest filings.
BALANCE = {   # ticker: (debt incl. USD-settled convertible principal, preferred notional, cash, as of). USD, latest filings (Oct 2026 check).
    "MSTR": (6.7535e9, 14.14e9, 6.02e9, "2026-09-27"),    # $6,713.7M converts + $39.8M secured debt; STRF/STRC/STRK/STRD/STRE notional; USD Reserve $5.02B + USD Cash $1.00B
    "MTPLF": (466e6, 149.6e6, 8.5e6, "2026-06-30"),      # $414M BTC-backed facility + JPY 8.0B bond + BitBonds; MERCURY preferred JPY 23.61B; cash JPY 1.09B + USDC
    "FWDI": (167.5e6, 0, 7.29e6, "2026-09-30"),          # Galaxy USD loans ("institutional debt"); no converts
    "DFDV": (154.07e6, 15.8e6, 4.335e6, "2026-06-30"),   # $126.05M converts + $28.0M USD/stablecoin borrowings; CHAD preferred (Sep 2026); SOL-denominated loans in COIN_OWED
    "UPXI": (60.99e6, 0, 5.78e6, "2026-06-30"),          # BitGo facility $57.3M + SBA $3.7M; the $166.4M converts settle in shares or SOL (see CONVERTS)
    "HSDT": (0, 0, 16.6e6, "2026-09-30"),                # no debt; $2.3M cash (9/24) + ~$14.3M Sept offering
    "TSLA": (9.34e9, 0, 43.52e9, "2026-06-30"),          # cash incl. short-term investments
    "SPCX": (39.71e9, 0, 100.01e9, "2026-06-30"),        # cash + short-term investments
}

# Convertibles: [principal (USD), conversion price per share (USD), SOL returned if not converted (0 = repaid in dollars), counted in "debt" or "pref"].
# The page treats a note as converted when the shares it converts into are worth more than what the holder gets otherwise.
CONVERTS = {
    "MSTR": [[1010e6, 183.19, 0, "debt"], [1500e6, 672.40, 0, "debt"], [800e6, 149.77, 0, "debt"], [2000e6, 433.43, 0, "debt"],
             [603.7e6, 232.72, 0, "debt"], [800e6, 204.33, 0, "debt"], [1402.1e6, 1000.0, 0, "pref"]],   # 2028/2029/2030A/2030B/2031/2032 notes; STRK preferred
    "MTPLF": [[149.6e6, round(1000 / 157.8, 2), 0, "pref"]],                                               # MERCURY preferred, converts at JPY 1,000
    "DFDV": [[114.58e6, 23.11, 0, "debt"], [11.47e6, 9.74, 0, "debt"]],
    "UPXI": [[149.996e6, 4.25, 962955, "sol"], [16.42e6, 2.39, 121221, "sol"]],                         # not repayable in cash: shares, or SOL back at maturity
}

# Holdings and share counts from the latest filings/press releases; these win over the monthly CoinGecko/Yahoo refresh.
# Share counts include pre-funded and penny warrants (effectively shares).
FILED = {
    "MSTR": {"qty": 847666, "shares": 421970000, "asof": "2026-09-27"},
    "MTPLF": {"qty": 43000, "shares": 1364255696, "asof": "2026-09-30"},
    "FWDI": {"qty": 8501298, "shares": 105535801, "asof": "2026-09-30"},    # fully diluted (incl. pre-funded/penny warrants)
    "DFDV": {"qty": 2538010, "asof": "2026-09-28"},
    "UPXI": {"qty": 2340150, "shares": 89094774, "asof": "2026-06-30"},     # incl. 1,084,176 SOL set aside for the notes; 82.1M shares + 6.99M pre-funded warrants
    "HSDT": {"qty": 2320000, "shares": 88916449, "asof": "2026-09-30"},     # "2.3M SOL"; 65.1M shares + 23.8M pre-funded/advisor warrants
}

COIN_OWED = {"DFDV": (61.75e6, "2026-06-30")}   # SOL-denominated term loans ($5.5M) and DeFi borrowings ($56.25M)

# Treasury companies: price history is cut to start when each became a coin treasury, so older,
# unrelated business history (and its reverse splits) doesn't distort the charts, ratios or all-time highs.
TREASURY_START = {"MSTR": "2020-08-11", "MTPLF": "2024-04-08", "DFDV": "2025-04-07", "UPXI": "2025-04-21",
                  "FWDI": "2025-09-08", "HSDT": "2025-09-15"}

# Treasury companies not already in TICKERS (price history for the Markets chart)
TREASURY_HIST = [("MTPLF", "Metaplanet (MTPLF)"), ("HSDT", "Solana Company (HSDT)")]
AUX = [("SI=F", "Silver (futures, $/oz)")]   # used only to convert silver targets to SLV

# Price targets for the "Projected Growth" ranking (checked 2026-09-28).
# Rules: base cases only (no bear/bull scenarios); published within about the last two years;
# at least 3 forecasters per asset. Every source is listed on the page with its link.
#   long  = 2030 targets (a 2029 or "long-term" call counts as 2030; the horizon is shown on the page)
#   short = roughly 12-month targets (end-2026 to end-2027)
#   cons  = 12-month Wall Street analyst consensus (stocks)
#   kind "direct": targets are in the asset's own price;  "proxy": targets are for the underlying
#   (silver $/oz for SLV, uranium for UUUU, ...) and are converted at today's ratio;  "nav": treasury
#   company, derived from its coin's 2030 targets.
# USER_INPUT: your own 2030 target for any asset. Set a number and it becomes one more source
# (e.g. USER_INPUT["MP"] = 90). Leave None to ignore.
import statistics
USER_INPUT = {"BTC-USD": None, "ETH-USD": None, "SOL-USD": None, "SPY": None, "GC=F": None, "SLV": None, "HG=F": None,
              "TSLA": None, "SPCX": None, "NVDA": None, "AVGO": None, "MU": None, "MRVL": None, "MP": None, "UUUU": None, "SILJ": None}

TARGETS_ASOF = "2026-09-28"   # date the targets were checked; sector targets are locked to prices on this date
MON = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
def hdate(h, date):
    """Target date for a ~12-month forecast, so the page can rescale it to exactly 12 months from today."""
    import calendar, re
    end = lambda y, m: "%d-%02d-%02d" % (y, m, calendar.monthrange(y, m)[1])
    h = h.strip()
    if re.fullmatch(r"end-\d{4}", h): return end(int(h[4:]), 12)
    if re.fullmatch(r"mid-\d{4}", h): return end(int(h[4:]), 6)
    if re.fullmatch(r"\d{4}( avg)?", h): return end(int(h[:4]), 6)
    if re.fullmatch(r"Q[1-4]-\d{4}", h): return end(int(h[3:]), 3 * int(h[1]))
    if re.fullmatch(r"[A-Z][a-z]{2}-\d{4}", h) and h[:3] in MON: return end(int(h[4:]), MON[h[:3]])
    if h.startswith("FY") and re.match(r"FY\d{4}-\d{2}", h): return end(int(h[2:6]), 12)   # Australian FY Jul-Jun: midpoint
    if h == "12 months" and re.match(r"\d{4}(-\d{2})?", date or ""):
        y, m = int(date[:4]), int(date[5:7]) if len(date) > 4 else 6
        return end(y + 1, m)
    return None
def S(by, v, h, date, url="", note=""):
    return {"by": by, "v": v, "h": h, "hd": hdate(h, date), "date": date, "url": url, "note": note}
SPX = 10.02   # SPY is about the S&P 500 divided by 10.02
def spx(by, v, h, date, url="", note=""):
    return S(by, round(v / SPX, 2), h, date, url, ("S&P 500 %s" % format(v, ",")) + ("; " + note if note else ""))
def LB(t):   # copper $/t -> $/lb
    return round(t / 2204.62, 2)

FINDER = "https://www.finder.com/cryptocurrency/cryptocurrency-predictions"
MB = "https://www.marketbeat.com/stocks/"
REQ = "https://www.industry.gov.au/sites/default/files/2026-07/resources-and-energy-quarterly-june-2026.pdf"
WB = "https://thedocs.worldbank.org/en/doc/f3138644a1e8e2bb631399ae11d6c408-0050012026/related/CMO-April-2026-Forecasts.pdf"
PP_NOTE = "Tyler's personal 2030 prediction; weighted 50% (all other sources share the other 50%)"
# Personal predictions (Tyler): 2030 and 2032 price targets
PERSONAL = {"BTC-USD": (622782, 987001), "MSTR": (2489, 4770), "TSLA": (4794, 7910), "SOL-USD": (2153, 2970)}

TARGETS = {
    "BTC-USD": {"kind": "direct", "unit": "$", "long": [
        S("Personal predictions", 622782, "2030", "2026-10", "", PP_NOTE + "; 2032: $987,001"),
        S("ARK Invest", 710000, "end-2030", "2026-01", "https://www.ark-invest.com/articles/valuation-models/arks-bitcoin-price-target-2030", "Base case, reaffirmed in Big Ideas 2026"),
        S("Standard Chartered (Geoff Kendrick)", 500000, "end-2030", "2026-08", "https://www.investing.com/news/cryptocurrency-news/stanchart-cuts-bitcoin-price-forecast-for-2026-here-is-the-new-target-4397979", "Pushed back from end-2028 in Dec 2025"),
        S("Finder expert panel", 490000, "end-2030", "2026-04", FINDER, "Panel average"),
        S("Bernstein (Gautam Chhugani)", 300000, "2029", "2026-08", "https://www.theblock.co/news/markets/2026-08-26-bernstein-sees-bitcoin-reaching-150000-by-mid-2027-amid-debasement-trade-but-cuts-strategy-target-to-350-412778", "Base path")],
      "short": [
        S("Bernstein (Gautam Chhugani)", 150000, "mid-2027", "2026-08", "https://www.theblock.co/news/markets/2026-08-26-bernstein-sees-bitcoin-reaching-150000-by-mid-2027-amid-debasement-trade-but-cuts-strategy-target-to-350-412778"),
        S("Citi", 82000, "12 months", "2026-07", "https://www.coindesk.com/markets/2026/07/01/citi-slashes-12-month-bitcoin-ether-targets-as-etf-flows-dry-up", "Base case"),
        S("Galaxy Digital (Alex Thorn)", 250000, "end-2027", "2025-12", "https://www.coindesk.com/markets/2025/12/21/galaxy-digital-s-head-of-research-explains-why-bitcoin-s-outlook-is-so-uncertain-in-2026"),
        S("Tom Lee (Fundstrat)", 150000, "end-2026", "2026-08", "https://www.foreignpolicyjournal.com/2026/08/30/bitmine-nasdaq-bmnr-chairman-tom-lee-sets-6000-ethereum-price-target-as-bitcoin-eyes-150000/"),
        S("Finder expert panel", 127000, "end-2026", "2026-04", FINDER, "Panel average")]},
    "ETH-USD": {"kind": "direct", "unit": "$", "long": [
        S("Standard Chartered (Geoff Kendrick)", 40000, "end-2030", "2026-02", "https://www.coindesk.com/markets/2026/01/12/standard-chartered-predicts-ether-will-outperform-bitcoin-hit-usd40-000-by-2030"),
        S("Bitwise (Matt Hougan)", 10000, "2030", "2025-11", "https://www.dlnews.com/articles/markets/eth-price-beyond-10000-by-2030-says-bitwise/", "\"$10,000+\""),
        S("Finder expert panel", 8488, "end-2030", "2026-04", FINDER, "Panel average")],
      "short": [
        S("Standard Chartered (Geoff Kendrick)", 4000, "end-2026", "2026-02", "https://finance.yahoo.com/markets/crypto/articles/standard-chartered-cuts-ethereum-target-122316608.html"),
        S("Citi", 2240, "12 months", "2026-07", "https://www.coindesk.com/markets/2026/07/01/citi-slashes-12-month-bitcoin-ether-targets-as-etf-flows-dry-up", "Base case"),
        S("Tom Lee (Fundstrat)", 6000, "end-2026", "2026-08", "https://www.foreignpolicyjournal.com/2026/08/30/bitmine-nasdaq-bmnr-chairman-tom-lee-sets-6000-ethereum-price-target-as-bitcoin-eyes-150000/"),
        S("Finder expert panel", 3263, "end-2026", "2026-04", FINDER, "Panel average")]},
    "SOL-USD": {"kind": "direct", "unit": "$", "long": [
        S("Personal predictions", 2153, "2030", "2026-10", "", PP_NOTE + "; 2032: $2,970"),
        S("Standard Chartered (Geoff Kendrick)", 2000, "end-2030", "2026-02", "https://www.theblock.co/news/markets/2026-02-03-standard-chartered-cuts-solana-2026-target-shift-memecoins-micropayments-388248", "Reaffirmed Aug 2026"),
        S("Finder expert panel", 586, "end-2030", "2026-04", FINDER, "Panel average")],
      "short": [
        S("Standard Chartered (Geoff Kendrick)", 135, "end-2026", "2026-07", "https://en.bitcoinsistemi.com/standard-chartered-shares-year-end-2026-price-targets-for-bitcoin-ethereum-and-solana/"),
        S("Standard Chartered (Geoff Kendrick)", 400, "end-2027", "2026-02", "https://cryptonews.com/news/standard-chartered-revises-solana-targets/", "From the Feb 2026 path"),
        S("Finder expert panel", 182, "end-2026", "2026-04", FINDER, "Panel average")]},
    "SPY": {"kind": "direct", "unit": "$", "long": [
        spx("Yardeni Research", 10000, "end-2029", "2025"),
        spx("Trivariate Research", 10000, "2030", "2025"),
        spx("Sanctuary Wealth", 11500, "2030", "2025", "", "midpoint of 10,000-13,000")],
      "short": [
        spx("Jefferies", 9000, "end-2027", "2026-09", "https://finance.yahoo.com/markets/stocks/articles/jefferies-sets-jaw-dropping-p-144911441.html"),
        spx("Wells Fargo Investment Institute", 8700, "2027", "2026-06", "https://finance.yahoo.com/markets/stocks/articles/wells-fargo-p-500-target-164700713.html", "midpoint of 8,600-8,800"),
        spx("Yardeni Research", 8400, "mid-2027", "2026-09", "https://stocktwits.com/news-articles/markets/equity/ed-yardeni-says-phenomenal-earnings-keep-bull-case-intact-but-pushes-his-s-and-p-500-target-of-8-400-to-mid-2027/cZMStMIRBQK"),
        spx("UBS Global Wealth Management", 8400, "mid-2027", "2026-08", "https://www.bitget.com/news/detail/12560605712730"),
        spx("Morgan Stanley (Mike Wilson)", 8300, "12 months", "2026-05", "https://www.investing.com/news/stock-market-news/morgan-stanley-ups-sp-500-price-target-to-8300-on-robust-earnings-4683562")]},
    "GC=F": {"kind": "direct", "unit": "gold $/oz", "long": [
        S("Bernstein (Bob Brackett)", 5600, "2030", "2026-09", "https://www.investing.com/news/commodities-news/bernstein-unveils-new-gold-price-forecast-for-2030-4908919"),
        S("Yardeni Research", 10000, "end-2029", "2026-03", "https://uk.finance.yahoo.com/news/yardeni-sticks-long-term-gold-114209690.html"),
        S("Rockefeller Global (Doug Moglia)", 8000, "2030", "2026-05", "https://www.kitco.com/news/article/2026-05-27/gold-will-top-5500-2027-could-reach-10000-2030-silvers-upside-will-narrow"),
        S("In Gold We Trust (Incrementum)", 8900, "end-2030", "2026-05", "https://www.bullionstar.com/blogs/bullionstar/in-gold-we-trust-2026-key-takeaways-for-gold-investors/", "Their adopted working scenario"),
        S("JPMorgan", 4500, "long-term", "2026-02", "https://www.investing.com/news/economy-news/factboxjp-morgan-raises-longterm-gold-price-forecast-15-to-4500-an-ounce-4523574")],
      "short": [
        S("Goldman Sachs", 5400, "end-2027", "2026-09", "https://www.investing.com/news/commodities-news/what-fed-rate-hikes-mean-for-gold-prices-in-2027-according-to-goldman-4907014"),
        S("UBS", 5400, "Sep-2027", "2026-09", "https://www.investing.com/news/commodities-news/ubs-expects-gold-volatility-near-term-remains-constructive-on-12month-outlook-4905873"),
        S("OCBC", 4820, "Sep-2027", "2026-07", "https://finance.yahoo.com/markets/commodities/articles/ocbc-cuts-gold-silver-forecasts-135236505.html"),
        S("World Bank", 4300, "2027 avg", "2026-04", WB),
        S("Australia Resources & Energy Quarterly", 4862, "FY2026-27", "2026-07", REQ)]},
    "SLV": {"kind": "proxy", "of": "SI=F", "unit": "silver $/oz", "long": [
        S("InvestingHaven", 82, "2030", "2026", "https://investinghaven.com/forecasts/silver-price-prediction/", "Independent forecaster"),
        S("GoldRepublic (from JPMorgan)", 80, "2030", "2026-09", "https://www.goldrepublic.com/en-us/silver-price/forecast", "JPMorgan's 2027 forecast carried forward"),
        S("BlackRock / JPMorgan (as reported)", 100, "2030", "2025", "https://finance.yahoo.com/personal-finance/investing/article/silver-price-predictions-what-can-investors-expect-over-the-next-10-years-130000730.html", "Loosely attributed; weakest source"),
        # High-end calls added at Tyler's request (not bank base cases)
        S("Michael Oliver (MSA Research)", 150, "2026 call, held to 2030", "2025", "https://theoregongroup.com/commodities/gold/can-silver-hit-150-in-2026/", "Technical analyst; midpoint of his $100-200 scenario")],
      "short": [
        S("UBS (Dominic Schnider)", 80, "Sep-2027", "2026-09", "https://finance.yahoo.com/markets/commodities/articles/ubs-forecasts-silver-80-september-142821460.html"),
        S("HSBC", 68, "2027 avg", "2026-05", "https://finance.yahoo.com/markets/commodities/articles/hsbc-raises-silver-forecasts-2026-113000675.html"),
        S("BofA (Michael Widmer)", 75, "Q2-2027", "2026-05", "https://www.kitco.com/news/article/2026-05-27/silver-can-reach-100-ounce-year-momentum-wont-last-bank-america"),
        S("OCBC", 74, "Sep-2027", "2026-07", "https://finance.yahoo.com/markets/commodities/articles/ocbc-cuts-gold-silver-forecasts-135236505.html"),
        S("JPMorgan", 63.90, "2027 avg", "2026-08", "https://www.jpmorgan.com/insights/global-research/commodities/silver-prices")]},
    "CPER": {"kind": "proxy", "of": "HG=F", "unit": "copper $/lb", "long": [
        S("BMI (Fitch Solutions)", LB(15800), "2030", "2026-07", "https://www.mining.com/copper-price-bmi-hikes-forecasts-structural-deficits-to-bring-17000-next-decade/", "$15,800/t"),
        S("Goldman Sachs", LB(12250), "2029-30", "2025", "https://www.itiger.com/news/1199775788", "$12,250/t"),
        S("JPMorgan", LB(12000), "long-term", "2026-02", "https://goldinvest.de/en/copper-price-in-focus-j-p-morgan-raises-long-term-forecast-to-12000-per-tonne", "$12,000/t"),
        S("Macquarie", LB(10200), "2030+", "2026", "https://www.mining.com/macquarie-says-copper-price-rally-still-running-ahead-of-reality/", "$10,200/t, 2025 dollars"),
        S("Australia Resources & Energy Quarterly", LB(12233), "FY2030-31", "2026-07", REQ, "$12,233/t")],
      "short": [
        S("Goldman Sachs", LB(13800), "2027 avg", "2026", "https://www.scottsdalemint.com/articles/2026/copper-goldman-raises-price-targets-on-us-stockpiling/", "$13,800/t"),
        S("UBS", LB(15500), "Jun-2027", "2026-05", "https://thebull.com.au/news/copper-price-target-for-2027-raised-as-supply-crisis-deepens/", "$15,500/t"),
        S("BofA", LB(13501), "2027 avg", "2026-05", "https://thebull.com.au/news/copper-price-target-for-2027-raised-as-supply-crisis-deepens/", "$13,501/t"),
        S("Macquarie", LB(11000), "Q3-2027", "2026", "https://www.mining.com/macquarie-says-copper-price-rally-still-running-ahead-of-reality/", "$11,000/t"),
        S("Citi", LB(15000), "12 months", "2026-06", "https://www.cnbc.com/2026/06/01/citi-bullish-copper-forecast-metals-prices.html", "$15,000/t")]},
    # Uranium $/lb: sector outlook used for Energy Fuels (UUUU). Spot $89.30 (Trading Economics, 2026-09-28)
    "URANIUM": {"kind": "sector", "unit": "uranium $/lb", "spot": 89.30, "long": [
        S("Morgans", 102.5, "2030", "2026-05", "https://fnarena.com/index.php/2026/05/26/uranium-week-structural-bull-cycle-intact/", "~$100 FY29, $105-110 FY31"),
        S("Jefferies (Mitch Ryan)", 95, "long-term", "2026-09", "https://ca.finance.yahoo.com/news/jefferies-raises-long-term-uranium-123608225.html"),
        S("Macquarie", 95, "long-term", "2026-05", "https://fnarena.com/index.php/2026/05/26/uranium-week-structural-bull-cycle-intact/"),
        S("Australia Resources & Energy Quarterly", 116, "FY2030-31", "2026-07", REQ),
        S("Shaw and Partners", 120, "long-term (2032+)", "2026-02", "https://newshub.medianet.com.au/2026/02/uranium-super-cycle-emerging-as-shaw-and-partners-lifts-price-forecast-to-us200-lb/141734/")]},
    "TSLA": {"kind": "direct", "unit": "$", "long": [
        S("Personal predictions", 4794, "2030", "2026-10", "", PP_NOTE + "; 2032: $7,910"),
        S("ARK Invest", 2600, "2029", "2025", "https://www.ark-invest.com/articles/valuation-models/arks-tesla-price-target-2029", "Expected value"),
        S("Baron Capital (Ron Baron)", 2250, "2030", "2026", "", "\"$2,000 or $2,500\" (midpoint)"),
        S("24/7 Wall St (Vandita Jadeja)", 510.02, "2030", "2026-05", "https://247wallst.com/investing/2026/05/20/this-will-be-teslas-stock-price-in-2030/", "Base case")],
      "cons": {"by": "MarketBeat", "avg": 410.98, "low": 25.28, "high": 840, "n": 47, "date": "2026-09-28", "url": MB + "NASDAQ/TSLA/forecast/"}},
    # SPCX: Tyler asked for the higher-end 2030 calls; the two lowest (Goldman pre-IPO $135, Motley Fool/Drury $109) were removed
    "SPCX": {"kind": "direct", "unit": "$", "long": [
        S("Raymond James (Brian Gesuale)", 800, "2031", "2026-07", "https://www.fool.com/investing/2026/07/10/raymond-james-sets-wall-streets-highest-price-targ/", "Street-high target; ~$10.8T market cap"),
        S("Morgan Stanley (Adam Jonas)", 600, "bull case", "2026-08", "https://www.thestreet.com/investing/stocks/morgan-stanley-sends-strong-signal-on-spacex-stock-price-target", "Bull case (~$8T); base is $300. Included by request"),
        S("Motley Fool (Ryan Vanzo), from Goldman's 2030 AI revenue estimate", 465, "2030", "2026-07", "https://finance.yahoo.com/markets/stocks/articles/prediction-500-000-invested-spacex-015900847.html", "~$6.3T market cap"),
        S("ARK Invest", 190, "2030", "2025-06", "https://www.ark-invest.com/articles/valuation-models/ark-expected-value-spacex-2030", "~$2.5T enterprise value (expected value)")],
      "cons": {"by": "MarketBeat", "avg": 219.24, "low": 75, "high": 800, "n": 44, "date": "2026-09-28", "url": MB + "NASDAQ/SPCX/forecast/"}},
    "NVDA": {"kind": "direct", "unit": "$", "long": [
        S("I/O Fund (Beth Kindig)", 820, "2030", "2026-04", "https://io-fund.com/ai-stocks/nvidia-stock-20-trillion-market-cap-timing", "$20T market cap"),
        S("24/7 Wall St (Vandita Jadeja)", 600, "2030", "2026-09", "https://247wallst.com/investing/2026/09/08/price-prediction-nvidia-stock-could-be-worth-this-much-by-2030/"),
        S("Motley Fool (Steven Porrello)", 410, "2030", "2026-07", "https://www.fool.com/investing/2026/07/31/prediction-nvidia-will-be-a-10-trillion-company-by/", "$10T market cap")],
      "cons": {"by": "MarketBeat", "avg": 324.14, "low": 218, "high": 515, "n": 55, "date": "2026-09-28", "url": MB + "NASDAQ/NVDA/forecast/"}},
    "AVGO": {"kind": "direct", "unit": "$", "long": [
        S("24/7 Wall St (Vandita Jadeja)", 613.02, "2030", "2026-05", "https://247wallst.com/investing/2026/05/22/this-will-be-broadcoms-stock-price-in-2030/", "Base case"),
        S("24/7 Wall St (Joel South)", 709.08, "2030", "2026-02", "https://247wallst.com/forecasts/2026/02/14/broadcom-avgo-price-prediction-and-forecast-2025-2030/"),
        S("Motley Fool (Harsh Chauhan)", 384, "2030", "2026-03", "https://www.fool.com/investing/2026/03/20/prediction-broadcom-stock-will-trade-at-this-price/", "Base case")],
      "cons": {"by": "MarketBeat", "avg": 527.20, "low": 350, "high": 715, "n": 41, "date": "2026-09-28", "url": MB + "NASDAQ/AVGO/forecast/"}},
    "MU": {"kind": "direct", "unit": "$", "long": [
        S("New Street Research (Pierre Ferragu)", 2210, "2030", "2026-08", "https://stocktwits.com/news-articles/markets/equity/micron-2-3-trillion-giant-2030-ai-memory-demand-new-street-mu-stock-target/cZotm2aRJ0L", "$2-3T market cap (midpoint)"),
        S("24/7 Wall St (Vandita Jadeja)", 1025, "2030", "2026-05", "https://247wallst.com/investing/2026/05/13/will-micron-be-a-trillion-dollar-stock-by-2030-the-answer-is-yes/", "Base case"),
        S("watcher.guru (Loredana Harsana)", 1000, "2030", "2026-08", "https://watcher.guru/news/what-will-mu-stock-be-worth-in-2030-micron-is-entering-a-different-era", "Midpoint of $800-1,200")],
      "cons": {"by": "MarketBeat", "avg": 1348.03, "low": 300, "high": 2000, "n": 45, "date": "2026-09-28", "url": MB + "NASDAQ/MU/forecast/"}},
    "MRVL": {"kind": "direct", "unit": "$", "long": [
        S("Motley Fool (Harsh Chauhan)", 703, "2030", "2026-09", "https://www.fool.com/investing/2026/09/21/prediction-heres-what-a-5000-investment-in-marvell/", "CY2030 EPS $23.42 x 30"),
        S("24/7 Wall St (Vandita Jadeja)", 339, "2030", "2026-09", "https://247wallst.com/investing/2026/09/25/marvells-203-ytd-surge-sets-high-bar-but-we-see-more-runway-ahead/", "Base case"),
        S("24/7 Wall St price-prediction model", 333.29, "2030", "2026-09", "https://247wallst.com/companies/MRVL/price-prediction/", "Model base case"),
        S("Cantor Fitzgerald (C.J. Muse)", 600, "2030", "2026-09", "https://finance.yahoo.com/technology/ai/articles/marvell-ai-opportunity-could-expand-145429633.html", "Cantor's CY2030 EPS of at least $20 x 30 (same multiple as Motley Fool); revenue $40B+, 40-45% CAGR"),
        S("AltIndex", 624.92, "2030", "2026-10", "https://altindex.com/ticker/mrvl/price-prediction", "Base-case extrapolation"),
        S("CoinPriceForecast", 1067, "2030", "2026-10", "https://coinpriceforecast.com/mrvl-stock", "End-2030 forecast"),
        S("Traders Union", 1189.82, "2030", "2026-09", "https://tradersunion.com/currencies/forecast/mrvl-usd/", "2030 average")],
      "cons": {"by": "MarketBeat", "avg": 272.00, "low": 105, "high": 400, "n": 39, "date": "2026-09-29", "url": MB + "NASDAQ/MRVL/forecast/"}},
    # No named 2030 targets exist for these three; they use a sector's 2030 outlook, converted at today's price
    "MP": {"kind": "sector", "sector": "COMMOD", "unit": "$",
      "cons": {"by": "MarketBeat", "avg": 76.29, "low": 57, "high": 112, "n": 17, "date": "2026-09-28", "url": MB + "NYSE/MP/forecast/"}},
    "UUUU": {"kind": "sector", "sector": "URANIUM", "unit": "$",
      "cons": {"by": "MarketBeat", "avg": 21.85, "low": 16, "high": 29.25, "n": 7, "date": "2026-09-28", "url": MB + "NYSEAMERICAN/UUUU/forecast/"}},
    # Sprott uranium miners ETF and Yellow Cake plc (physical U3O8): no named 2030 targets either; both use the uranium outlook
    "URNM": {"kind": "sector", "sector": "URANIUM", "unit": "$"},
    "YCA": {"kind": "sector", "sector": "URANIUM", "unit": "$"},
    "SILJ": {"kind": "sector", "sector": "SLV", "unit": "$",
      "cons": {"by": "TipRanks (built from analyst targets on its 62 holdings)", "avg": 40.24, "low": 34.57, "high": 46.50, "n": 62, "date": "2026-09-28", "url": "https://www.tipranks.com/etf/silj/forecast"}},
    # Treasury companies: 2030 = coin's 2030 targets x coins per share x an assumed NAV multiple
    "MSTR": {"kind": "nav", "coin": "BTC-USD", "personal": {"v": 2489, "v2032": 4770, "note": PP_NOTE}, "cons": {"by": "MarketBeat", "avg": 239.88, "low": 54, "high": 473, "n": 19, "date": "2026-09-28", "url": MB + "NASDAQ/MSTR/forecast/"}, "short": [
        S("B. Riley", 195, "12 months", "2026-09"), S("Barclays", 160, "12 months", "2026-09"), S("Canaccord Genuity", 179, "12 months", "2026-09"),
        S("Alliance Global Partners", 217, "12 months", "2026-09"),
        S("Bernstein", 350, "12 months", "2026-08", "https://www.theblock.co/news/markets/2026-08-26-bernstein-sees-bitcoin-reaching-150000-by-mid-2027-amid-debasement-trade-but-cuts-strategy-target-to-350-412778"),
        S("Mizuho", 165, "12 months", "2026-08"), S("HC Wainwright", 325, "12 months", "2026-08"), S("Cantor Fitzgerald", 186, "12 months", "2026-08"),
        S("BTIG", 250, "12 months", "2026-07"), S("Benchmark", 435, "12 months", "2026-07"), S("Citigroup", 136, "12 months", "2026-06"),
        S("TD Cowen", 260, "12 months", "2026-06"), S("Truist", 268, "12 months", "2026-01")]},
    "MTPLF": {"kind": "nav", "coin": "BTC-USD", "cons": {"by": "MarketScreener (JPY 596 at 157.3 JPY/USD)", "avg": 3.79, "low": 2.57, "high": 5.00, "n": 2, "date": "2026-09", "url": "https://www.marketscreener.com/quote/stock/METAPLANET-INC-11551336/consensus/"}, "short": [
        S("Cantor Fitzgerald (Nathan Frankovitz)", 3.66, "12 months", "2026", "https://www.tipranks.com/stocks/jp:3350/forecast", "JPY 576"),
        S("Chardan (James McIlree)", 5.73, "12 months", "2026", "https://www.tipranks.com/stocks/jp:3350/forecast", "JPY 901")]},
    "FWDI": {"kind": "nav", "coin": "SOL-USD", "cons": {"by": "MarketBeat", "avg": 12.50, "low": 9, "high": 16, "n": 2, "date": "2026-09", "url": MB + "NASDAQ/FWDI/forecast/"}, "short": [
        S("Cantor Fitzgerald", 16, "12 months", "2026-09"), S("B. Riley", 9, "12 months", "2026-09")]},
    "DFDV": {"kind": "nav", "coin": "SOL-USD", "cons": {"by": "MarketBeat", "avg": 10.40, "low": 10.40, "high": 10.40, "n": 1, "date": "2026-09", "url": MB + "NASDAQ/DFDV/forecast/"}, "short": [
        S("Cantor Fitzgerald (Gareth Gacetta)", 10.40, "12 months", "2026-09")]},
    "UPXI": {"kind": "nav", "coin": "SOL-USD", "cons": {"by": "MarketBeat", "avg": 5.00, "low": 2, "high": 8, "n": 2, "date": "2026-09", "url": MB + "NASDAQ/UPXI/forecast/"}, "short": [
        S("Cantor Fitzgerald", 2, "12 months", "2026-09"), S("iA Financial", 8, "12 months", "2026-01")]},
    "HSDT": {"kind": "nav", "coin": "SOL-USD", "cons": {"by": "MarketBeat", "avg": 3.25, "low": 2.5, "high": 4, "n": 2, "date": "2026-09", "url": MB + "NASDAQ/HSDT/forecast/"}, "short": [
        S("B. Riley (Fedor Shabalin)", 2.50, "12 months", "2026-08"), S("Maxim Group", 4, "12 months", "2026-04")]},
}
for k, v in USER_INPUT.items():
    if v is not None: TARGETS[k].setdefault("long", []).append(S("User input", v, "2030", "", "", "Tyler's own target"))
# Summaries the page uses. 2030 median: plain median of all sources, except Personal predictions get 50% weight
# (BTC, SOL, TSLA; MSTR on the page) and the other sources' average the other 50%.
for k, t in TARGETS.items():
    L = t.get("long")
    if L:
        vals = [s["v"] for s in L]; ia = [s["v"] for s in L if s["by"] == "Personal predictions"]
        others = [s["v"] for s in L if s["by"] != "Personal predictions"]
        t.update(low=min(vals), high=max(vals), n=len(vals),
                 base=round(0.5 * ia[0] + 0.5 * statistics.mean(others), 4) if ia and others else statistics.median(vals))
    if t.get("short"): t["avg12"] = round(statistics.mean([s["v"] for s in t["short"]]), 4); t["n12"] = len(t["short"])
    if t.get("cons"): t["avg12"] = t["cons"]["avg"]; t["n12"] = t["cons"]["n"]; t["cons"]["hd"] = hdate("12 months", t["cons"]["date"])
assert all(t.get("n", 3) >= 3 for t in TARGETS.values())
# Tyler's adjustment: double every gold, silver, copper and uranium target (2030 and 12-month), and the 12-month
# consensus of the stocks that follow them (UUUU, SILJ). Published source values stay as published; only the summaries change.
TARGET_X2 = ["GC=F", "SLV", "CPER", "URANIUM", "UUUU", "URNM", "YCA", "SILJ"]
for k in TARGET_X2:
    t = TARGETS[k]
    for f2 in ("low", "high", "base", "avg12"):
        if t.get(f2) is not None: t[f2] = round(t[f2] * 2, 4)
    t["x2"] = True

def get(url, headers, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                return r.read().decode()
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(3 * (i + 1))

HISTORY_START = 1451606400   # 2016-01-01: fixed start, so older history never drops out of the backtests

def yahoo(sym):
    """Daily closes since 2016, plus dividend-adjusted closes (None when they never differ from the close)."""
    j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={HISTORY_START}&period2={int(time.time())}&interval=1d", UA_YAHOO))
    r = j["chart"]["result"][0]
    ts, cl = r["timestamp"], r["indicators"]["quote"][0]["close"]
    ac = (r["indicators"].get("adjclose") or [{}])[0].get("adjclose") or [None] * len(ts)
    rd = lambda c: round(c, 4 if c < 10 else 2)
    day = lambda t: dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%d")
    pts = [[day(t), rd(c)] for t, c in zip(ts, cl) if c is not None]
    adj = [[day(t), rd(a)] for t, c, a in zip(ts, cl, ac) if c is not None and a is not None]
    if not adj or all(abs(a[1] / p[1] - 1) < 0.002 for a, p in zip(adj, pts) if p[1]): adj = None
    return pts, adj

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
    data = {"updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "prices": {}, "macro": {}}

    for sym, name, group in [(a, b, None) for a, b in TICKERS] + [(a, b, "treasury") for a, b in TREASURY_HIST] + [(a, b, "aux") for a, b in AUX]:
        try:
            if sym == "YCA":   # Yellow Cake trades in London in pence: convert every close to USD with that day's GBP/USD
                pts, _ = yahoo("YCA.L"); fx = dict(yahoo("GBPUSD=X")[0]); fxd = sorted(fx); adj = None; out = []; j = 0; last = None
                for d, v in pts:
                    while j < len(fxd) and fxd[j] <= d: last = fx[fxd[j]]; j += 1
                    if last: out.append([d, round(v / 100 * last, 4)])
                pts = out
            else:
                pts, adj = yahoo(sym)
            if sym in TREASURY_START:
                pts = [q for q in pts if q[0] >= TREASURY_START[sym]]
                if adj: adj = [q for q in adj if q[0] >= TREASURY_START[sym]]
            data["prices"][sym] = {"name": name, "points": pts}
            if adj: data["prices"][sym]["adj"] = adj   # dividend-adjusted, used for backtest returns
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
            "shadow":   {"name": "ShadowStats-style alternate inflation (estimate range)", "unit": "% y/y; official CPI + 4 to + 7 pts, the typical range of the gap to ShadowStats' 1980-method series since the late 1990s (Saville, TSI 2015)", "points": [[d, round(v + 7, 2)] for d, v in since(yoy)], "band": 3},
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

    # Treasury companies. Coin holdings (CoinGecko public treasury API) and share counts (Yahoo Finance)
    # are refreshed once a month; in between, the last fetched values are reused. The lists at the top are the fallback.
    oh = old.get("holdings") or {}
    today = dt.date.today().isoformat()
    stale = not oh.get("asof") or (dt.date.today() - dt.date.fromisoformat(oh["asof"])).days >= 30
    if stale:
        fresh = {"asof": today, "qty": {}, "shares": {}}
        CG = {"MSTR": "MSTR", "MTPLF": "3350", "SPCX": "SPCX", "TSLA": "TSLA", "FWDI": "FWDI", "DFDV": "DFDV", "UPXI": "UPXI", "HSDT": "HSDT"}
        for coin in ("bitcoin", "solana"):
            try:
                for c in json.loads(get("https://api.coingecko.com/api/v3/companies/public_treasury/" + coin, UA_YAHOO))["companies"]:
                    for t, pre in CG.items():
                        if (c.get("symbol") or "").upper().startswith(pre) and c.get("total_holdings"): fresh["qty"][t] = c["total_holdings"]
            except Exception as e: print("holdings failed", coin, e, file=sys.stderr)
        base_sh = {**{t: sh for t, _, sh, _ in TREASURY}, **oh.get("shares", {}), **{r["t"]: r["shares"] for r in old.get("treasury", {}).get("rows", []) if r.get("shares")}}
        try:   # a share count that jumps by more than a third is usually a data glitch (e.g. only one share class): keep the old one
            fresh["shares"] = {k: v for k, v in yahoo_shares(list(CG)).items() if v and (k not in base_sh or 0.75 < v / base_sh[k] < 1.33)}
        except Exception as e: print("shares failed", e, file=sys.stderr)
        if fresh["qty"] or fresh["shares"]:
            fresh["qty"] = {**oh.get("qty", {}), **fresh["qty"]}; fresh["shares"] = {**oh.get("shares", {}), **fresh["shares"]}; oh = fresh
    data["holdings"] = oh
    tre = {"holdings_asof": oh.get("asof", TREASURY_ASOF), "sol_asof": oh.get("asof", SOL_TREASURY_ASOF), "rows": []}
    olds = {r["t"]: r for r in old.get("treasury", {}).get("rows", [])}
    for t, name, coin, shares, qty in [(t, n, "BTC", sh, q) for t, n, sh, q in TREASURY] + [(t, n, "SOL", None, q) for t, n, q in SOL_TREASURY]:
        bal = BALANCE.get(t)
        fl = FILED.get(t, {})
        row = {"t": t, "name": name, "coin": coin, "debt": bal[0] if bal else None, "pref": bal[1] if bal else None, "cash": bal[2] if bal else None, "bal_asof": bal[3] if bal else None, "owed": COIN_OWED.get(t),
               "conv": CONVERTS.get(t, []), "filed": fl.get("asof"),
               "shares": fl.get("shares") or oh.get("shares", {}).get(t) or olds.get(t, {}).get("shares") or shares,
               "qty": fl.get("qty") or oh.get("qty", {}).get(t) or qty, "price": None}
        try:
            j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?range=5d&interval=1d", UA_YAHOO))
            row["price"] = round(j["chart"]["result"][0]["meta"]["regularMarketPrice"], 4)
        except Exception as e:
            print("treasury price failed", t, e, file=sys.stderr)
            if t in olds: row["price"] = olds[t]["price"]
        tre["rows"].append(row)
    data["treasury"] = tre

    try:   # risk-free rate for Sharpe ratios: latest 3-month Treasury bill
        tb = fred("DTB3"); data["rf"] = {"v": tb[-1][1], "date": tb[-1][0], "series": "DTB3"}
    except Exception as e:
        print("rf failed", e, file=sys.stderr)
        if "rf" in old: data["rf"] = old["rf"]
    data["targets"] = TARGETS
    data["targets_asof"] = TARGETS_ASOF

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
