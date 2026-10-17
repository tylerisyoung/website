// Finance curriculum for the Learn page: the core ideas needed to read the
// Financial Dashboard. Each concept is one flashcard; each quiz item is a
// multiple-choice question (answer = index of the correct choice).
window.LEARN_FINANCE = [
  // ---- Unit 1: Returns ----
  { id: "f-cagr", unit: "Returns", term: "CAGR",
    def: "Compound annual growth rate: the steady yearly rate that turns a start value into an end value.",
    formula: "CAGR = (End ÷ Start)^(1 ÷ years) − 1",
    page: "Projected Growth bars show each asset's CAGR from today's price to its median 2030 target, so big and small moves fit on one chart.",
    example: "$100 → $200 in 5 years is a 100% total return but a CAGR of about 14.9%.",
    quiz: [
      { q: "$100 grows to $200 over 5 years. What is the CAGR?", c: ["20%", "About 14.9%", "100%", "About 7%"], a: 1 },
      { q: "Why does the dashboard show CAGR instead of total return to 2030?", c: ["It is always higher", "It puts long and short horizons on the same yearly scale", "Analysts require it", "It removes volatility"], a: 1 } ] },
  { id: "f-total", unit: "Returns", term: "Return to 2030 median",
    def: "How much an asset would gain if it hit the median of all 2030 price targets.",
    formula: "Return = Median target ÷ Price − 1",
    page: "Used to rank assets on Projected Growth; the bar converts it to CAGR.",
    example: "Price $50, median target $150: return = 200%.",
    quiz: [
      { q: "Price $50, median 2030 target $150. Return to 2030 median?", c: ["300%", "200%", "150%", "66%"], a: 1 } ] },
  { id: "f-median", unit: "Returns", term: "Why the median target",
    def: "The median ignores one wild forecast; an average gets dragged by it.",
    page: "Low / High show the extremes; the median drives rankings. For BTC, SOL, TSLA and MSTR, half the weight goes to personal predictions.",
    example: "Targets 50, 60, 70, 500: median 65, mean 170.",
    quiz: [
      { q: "Targets are 50, 60, 70 and 500. What's the median?", c: ["170", "65", "60", "500"], a: 1 },
      { q: "On the dashboard, which assets mix personal predictions 50/50 with outside targets?", c: ["SPY and gold", "BTC, SOL, TSLA, MSTR", "Every asset", "Only uranium"], a: 1 } ] },
  { id: "f-12m", unit: "Returns", term: "12-month return",
    def: "Each ~1-year forecast is restated to exactly 12 months from today, compounding along the path to the target.",
    formula: "Price × (Target ÷ Price)^(12 ÷ months)",
    page: "Lets you compare near-term forecasts made on different dates.",
    quiz: [
      { q: "A target is 24 months away. To restate it to 12 months the dashboard…", c: ["Halves the return", "Takes the square root of the growth multiple", "Ignores it", "Doubles it"], a: 1 } ] },

  // ---- Unit 2: Risk ----
  { id: "f-vol", unit: "Risk", term: "Volatility",
    def: "How much returns swing around their average, the standard deviation of returns, annualized.",
    formula: "Annual vol = SD(weekly returns) × √52",
    page: "Risk axis of the Sharpe charts; uses weekly returns over the last 2 years.",
    example: "Weekly SD 3% → annual vol about 21.6%.",
    quiz: [
      { q: "Weekly return SD is 3%. Annualized volatility is about…", c: ["3%", "21.6%", "156%", "52%"], a: 1 },
      { q: "Why multiply by √52 and not 52?", c: ["Convention only", "Independent swings add up by variance, so SD grows with √time", "To make it smaller", "Because of taxes"], a: 1 } ] },
  { id: "f-dd", unit: "Risk", term: "Max drawdown",
    def: "The worst peak-to-trough fall before a new high. It's the pain you'd actually have sat through.",
    formula: "DD = 1 − Trough ÷ Prior peak",
    page: "Shown in backtest stats; the Value score adds a bonus for distance below all-time high (ATH).",
    example: "Peak $100, trough $40: drawdown 60%. You then need +150% to get back.",
    quiz: [
      { q: "After a 60% drawdown, what gain gets you back to even?", c: ["60%", "150%", "100%", "40%"], a: 1 } ] },
  { id: "f-corr", unit: "Risk", term: "Correlation",
    def: "From −1 to +1: how much two assets move together. Low correlation is what makes diversification work.",
    page: "Correlation heatmap: red = move together, blue = opposite, pale = unrelated (weekly returns, 2 years).",
    quiz: [
      { q: "On the heatmap, a deep red square between two tickers means…", c: ["They move opposite", "They move together", "One is cheaper", "They're unrelated"], a: 1 },
      { q: "Adding a low-correlation asset to a portfolio usually…", c: ["Raises risk", "Lowers portfolio volatility for the same return", "Lowers return to zero", "Has no effect"], a: 1 } ] },
  { id: "f-divers", unit: "Risk", term: "Position limits",
    def: "Caps on how much one name or one category can be. They stop an optimizer from betting everything on one forecast.",
    page: "Optimal mixes are capped at 60% per name and 80% per category. Core rebalances only if one asset exceeds 40%.",
    quiz: [
      { q: "The dashboard's optimal mixes cap any single name at…", c: ["40%", "60%", "80%", "100%"], a: 1 },
      { q: "The Core Portfolio rebalances only when one asset is more than…", c: ["20% of the total", "40% of the total", "60% of the total", "never"], a: 1 } ] },

  // ---- Unit 3: Risk-adjusted return ----
  { id: "f-sharpe", unit: "Risk-adjusted", term: "Sharpe ratio",
    def: "Return earned above the risk-free rate per unit of volatility. Higher = more reward per unit of risk.",
    formula: "Sharpe = (Return − Risk-free) ÷ Volatility",
    page: "Each dot on the Sharpe charts is a portfolio; the dark star is the highest-Sharpe mix.",
    example: "15% return, 4% risk-free, 22% vol → Sharpe 0.5.",
    quiz: [
      { q: "Return 15%, risk-free 4%, volatility 22%. Sharpe?", c: ["0.68", "0.5", "1.0", "0.18"], a: 1 },
      { q: "On the dashboard, the Sharpe chart's expected returns come from…", c: ["Past returns", "CAGR to the median 2030 targets", "Dividends", "Bond yields"], a: 1 } ] },
  { id: "f-sortino", unit: "Risk-adjusted", term: "Sortino ratio",
    def: "Like Sharpe, but only counts downside swings as risk, so upside volatility isn't punished.",
    formula: "Sortino = (Return − Risk-free) ÷ Downside volatility",
    quiz: [
      { q: "An asset with big upside spikes but few drops will have…", c: ["Sortino lower than Sharpe", "Sortino higher than Sharpe", "Equal ratios", "Negative Sortino"], a: 1 } ] },
  { id: "f-frontier", unit: "Risk-adjusted", term: "Random-mix cloud (efficient frontier)",
    def: "Simulating thousands of weightings shows the best return available at each risk level; the upper-left edge is the efficient frontier.",
    page: "Pale dots are 4,000 random mixes. Dark diamond = your portfolio; dark star = the best Sharpe mix.",
    quiz: [
      { q: "On the Sharpe chart, which is better: a dot up-and-left, or down-and-right?", c: ["Down-and-right", "Up-and-left", "Same", "Depends on the color"], a: 1 },
      { q: "The dark diamond on the Growth chart is…", c: ["The best possible mix", "Your current Growth Portfolio", "The S&P 500", "Bitcoin"], a: 1 } ] },
  { id: "f-implied", unit: "Risk-adjusted", term: "Implied vs measured returns",
    def: "The Sharpe charts use returns implied by price targets, not returns that actually happened. If the targets are wrong, so is the optimum.",
    page: "Note on the Sharpe section: 'implied by the price targets, not measured ones.'",
    quiz: [
      { q: "The biggest weakness of the dashboard's 'optimal mix' is…", c: ["It uses too few dots", "It's only as good as the price targets", "It ignores Bitcoin", "It uses daily data"], a: 1 } ] },
  { id: "f-mc", unit: "Risk-adjusted", term: "Monte Carlo simulation",
    def: "Running thousands of random future paths built from the expected return and volatility, to see a range of outcomes and not just one line.",
    page: "Monte Carlo: Growth Portfolio to 2030.",
    quiz: [
      { q: "A Monte Carlo chart is most useful for seeing…", c: ["The exact 2030 price", "The spread of likely outcomes", "Today's price", "Dividend dates"], a: 1 } ] },

  // ---- Unit 4: Value signals ----
  { id: "f-ema", unit: "Value signals", term: "EMA (exponential moving average)",
    def: "An average that weights recent prices more. Price far below its EMA = beaten down versus its recent trend.",
    formula: "EMAₜ = α·xₜ + (1 − α)·EMAₜ₋₁; α = 2 ÷ (N + 1)",
    page: "Comparative Value uses the 20-week EMA (α = 2/21) and the 200-day EMA (α = 2/201).",
    quiz: [
      { q: "For a 20-period EMA, α equals…", c: ["1/20", "2/21", "20/21", "2/20"], a: 1 } ] },
  { id: "f-gap", unit: "Value signals", term: "Log gap",
    def: "How far price is from a moving average, measured in log terms so up and down moves are symmetric.",
    formula: "g = ln(Price ÷ EMA)",
    quiz: [
      { q: "If price equals its EMA, the log gap is…", c: ["1", "0", "−1", "undefined"], a: 1 } ] },
  { id: "f-z", unit: "Value signals", term: "Z-score",
    def: "A gap divided by that asset's typical swing, so volatile assets aren't automatically the 'cheapest'.",
    formula: "z = g ÷ SD(g over ~2 years)",
    page: "A −10% gap is ≈ −2σ for SPY but only ≈ −0.5σ for a SOL treasury stock.",
    quiz: [
      { q: "A −10% gap for SPY is about −2σ. For a very volatile stock the same gap is…", c: ["Also −2σ", "Smaller, about −0.5σ", "Bigger, −5σ", "Positive"], a: 1 },
      { q: "Why does the dashboard use z-scores and not raw gaps?", c: ["They're easier to compute", "So volatile assets don't always look cheapest", "To include dividends", "For tax reasons"], a: 1 } ] },
  { id: "f-value", unit: "Value signals", term: "Value score",
    def: "Average z-score below both EMAs, plus a bonus for distance below the all-time high. Higher = cheaper.",
    formula: "−(z₂₀w + z₂₀₀d) ÷ 2 + 0.75 × DD",
    quiz: [
      { q: "In the Value score, a higher number means the asset is…", c: ["More expensive", "Cheaper", "Less volatile", "Newer"], a: 1 } ] },
  { id: "f-powerlaw", unit: "Value signals", term: "Log regression fair value (power law)",
    def: "Fits ln(price) against ln(days since launch) on the whole history. The line is a 'fair value' trend, a description of the past and not a forecast.",
    formula: "ln(Price) = a + b × ln(days); Fair value = e^(a + b·ln(days))",
    page: "Fair Value chart: bars show how far today's price is above or below the trendline; −2σ = rarely this cheap. Needs 2+ years of data.",
    quiz: [
      { q: "The fair-value trendline is best described as…", c: ["A forecast", "A fit of past prices", "An analyst target", "A moving average"], a: 1 },
      { q: "Which assets can't be shown on Fair Value?", c: ["Bitcoin", "Ones with under 2 years of prices", "Gold", "SPY"], a: 1 } ] },
  { id: "f-log", unit: "Value signals", term: "Log scale",
    def: "On a log chart, equal distances are equal percentage moves, so 10→20 looks the same as 100→200.",
    page: "Price charts and Backtests Compared offer a log scale.",
    quiz: [
      { q: "On a log chart, which is the same height as 10→20?", c: ["10→30", "100→200", "100→110", "20→30"], a: 1 } ] },

  // ---- Unit 5: Crypto treasury companies ----
  { id: "f-cps", unit: "Treasury companies", term: "Coins per share (CPS)",
    def: "How much BTC or SOL backs each share.",
    formula: "CPS = Coins held ÷ Shares outstanding",
    quiz: [
      { q: "A company holds 10,000 BTC and has 100M shares. CPS?", c: ["0.001 BTC", "0.0001 BTC", "0.01 BTC", "100 BTC"], a: 1 } ] },
  { id: "f-mnav", unit: "Treasury companies", term: "mNAV",
    def: "Market cap ÷ value of coins held. Above 1 = you pay a premium for the coins; below 1 = discount.",
    formula: "mNAV = Price ÷ (CPS × coin price)",
    page: "Green = below 1 (cheaper than its coins), red = above 1.",
    quiz: [
      { q: "mNAV of 0.8 means the stock…", c: ["Trades at a 20% premium to its coins", "Trades at a 20% discount to its coins", "Has no coins", "Has 80% debt"], a: 1 } ] },
  { id: "f-mnavdebt", unit: "Treasury companies", term: "mNAV including debt",
    def: "Enterprise value per dollar of coins: what you really pay once lenders and preferred holders are paid first.",
    formula: "(Market cap + debt + preferred − cash) ÷ crypto held",
    quiz: [
      { q: "Adding debt to the mNAV calculation usually makes the stock look…", c: ["Cheaper", "More expensive", "Unchanged", "Riskless"], a: 1 } ] },
  { id: "f-conv", unit: "Treasury companies", term: "Convertible notes",
    def: "Debt that turns into shares when that's worth more to the holder. Conversion removes debt but adds shares (dilution).",
    page: "'Notes converting at 1st target' and the Final column apply every in-the-money conversion.",
    quiz: [
      { q: "When convertible notes convert, existing shareholders get…", c: ["More debt", "Diluted by new shares", "A dividend", "Nothing changes"], a: 1 } ] },
  { id: "f-tgt", unit: "Treasury companies", term: "Treasury company 2030 target",
    def: "Coin target × CPS, scaled by √mNAV, assuming the premium falls halfway back to 1.0x.",
    formula: "Target = coin 2030 target × CPS × √mNAV",
    quiz: [
      { q: "Why √mNAV and not the full mNAV?", c: ["It's simpler", "It assumes the premium shrinks halfway toward 1.0x", "Square roots are safer", "Tax law"], a: 1 } ] },

  // ---- Unit 6: Strategy & backtests ----
  { id: "f-dca", unit: "Strategy", term: "Dollar-cost averaging (DCA)",
    def: "Investing the same amount on a schedule, whatever the price, so you buy more units when prices are low.",
    page: "Backtests: $7,000 a year into a Roth IRA, about $135 every Monday since March 2020.",
    quiz: [
      { q: "The backtests invest how much each Monday?", c: ["$7,000", "About $135", "$1,000", "$500"], a: 1 } ] },
  { id: "f-irr", unit: "Strategy", term: "Money-weighted vs time-weighted return",
    def: "Money-weighted (IRR) counts when your deposits arrived, which is the right measure for DCA. Time-weighted strips deposits out to judge the strategy itself.",
    quiz: [
      { q: "To judge how YOUR deposits grew under DCA, use…", c: ["Time-weighted return", "Money-weighted return (IRR)", "Total return", "Volatility"], a: 1 } ] },
  { id: "f-bias", unit: "Strategy", term: "Backtest biases",
    def: "Starting in March 2020, just before the COVID low, flatters every plan. Picking names in 2026 that did well adds survivorship bias.",
    page: "Limits note under the Backtests.",
    quiz: [
      { q: "Choosing today's winners and testing them over the past creates…", c: ["Diversification", "Survivorship bias", "Mean reversion", "Leverage"], a: 1 },
      { q: "Why does a March 2020 start flatter every backtest?", c: ["Low fees", "It begins weeks before the COVID market bottom", "Tax changes", "Bitcoin halving"], a: 1 } ] },
  { id: "f-layer", unit: "Strategy", term: "Layer in / layer out",
    def: "Buy steadily (layer in), and trim into strength: Backtest 3 sells 20% of a holding when it's 80% above its trendline, then buys the #1 Value-score name.",
    quiz: [
      { q: "Backtest 3 trims a holding when price is more than ___ above its trendline.", c: ["20%", "80%", "50%", "100%"], a: 1 } ] },
  { id: "f-best", unit: "Strategy", term: "This Week's Best Buys",
    def: "Each asset gets a 0–100 score from its Value rank and its Growth rank; the overall score is the average. Top 10 shown; backtests buy the top 5.",
    formula: "Overall = (Value score + Growth score) ÷ 2",
    quiz: [
      { q: "Best Buys combines which two rankings?", c: ["Sharpe and volatility", "Comparative Value and Projected Growth", "Price and volume", "mNAV and debt"], a: 1 } ] },
  { id: "f-core", unit: "Strategy", term: "Core vs Growth portfolio rules",
    def: "Core: buy and hold, sell 10% at each price target, rebalance only above 40%. Growth (tax-free Roth): trade pairs, sell 10/20/30% at targets 1/2/3, try to time the top with 20%.",
    quiz: [
      { q: "At its third price target, the Growth Portfolio sells…", c: ["10%", "30%", "20%", "everything"], a: 1 },
      { q: "Why run active trading in the Roth account?", c: ["Higher returns guaranteed", "Gains are tax-free, so frequent trades don't trigger tax", "Lower fees", "It's required"], a: 1 } ] },
  { id: "f-pairs", unit: "Strategy", term: "Pair trading",
    def: "Rotating between two closely related assets, such as TSLA/SPCX, MSTR/BTC or SLV/gold, toward whichever is relatively cheaper.",
    quiz: [
      { q: "Which is one of the dashboard's trading pairs?", c: ["SPY/QQQ", "MSTR/BTC", "AAPL/MSFT", "Gold/Oil"], a: 1 } ] },
  { id: "f-rf", unit: "Strategy", term: "Risk-free rate",
    def: "The return you'd get with no risk (short-term Treasury bills). Sharpe and Sortino measure return above this.",
    quiz: [
      { q: "If an asset's return equals the risk-free rate, its Sharpe is…", c: ["1", "0", "Negative", "Infinite"], a: 1 } ] }
];
