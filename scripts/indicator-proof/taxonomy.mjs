/**
 * FAMILY TAXONOMY FROM EVIDENCE, not from the entry's name.
 *
 * The first attempt matched on the indicator's NAME ("rsi", "stoch", "williams") and produced 42
 * failures. Adjudicated one by one below, the great majority were the RULE being wrong. The rewrite
 * therefore asks a different question, in a fixed order, and each step is something MEASURED or
 * something the vendor DECLARES — never something inferred from a word in a title.
 *
 * STEP 1 — is this plot on the price scale?   [MEASURED, per plot, by lambda-scaling]
 *   A plot whose values multiply by lambda when every OHLC multiplies by lambda is denominated in
 *   price. No fixed numeric range can apply to it, whatever the entry is called. This is what
 *   disqualifies `williams-alligator.plot0` ("Jaw"), `cm-rsi-2-upper.plot0` ("SMA 200") and
 *   `ma-shift.plot0` ("MA") — all of them price-scale plots inside an entry whose NAME mentions an
 *   oscillator. Measured, not declared: it cannot be fooled by a mislabelled title.
 *
 * STEP 2 — does the vendor declare its own reference band?   [DECLARED, per indicator]
 *   `hlineConfig` (35 entries) and the result's `hlines` channel (97 entries) are DISJOINT
 *   mechanisms — measured, `both = 0`. Where either exists, the vendor has stated where it expects
 *   the reading to live: RSI 30/50/70, %B 0/0.5/1, Williams %R -20/-50/-80, CMO 0.
 *   The evidence-derived rule is then CONSISTENCY, not conformance to a range I picked: the declared
 *   reference levels must be reachable within the plot's observed range. This is what clears
 *   `stochastic-ott`, whose hlines are at 1020/1080 and whose plot lives at 1002..1047 — internally
 *   consistent, and my "%K must be in [0,100]" was the thing that was wrong.
 *
 * STEP 3 — a hand-asserted mathematical bound.   [ASSERTED, exact ids only]
 *   Only where the DEFINITION forces the bound, only by exact id, and the definition is written out
 *   next to the entry. Never by pattern: `rsi` is bounded, `rsi-bands` draws bands AROUND an RSI and
 *   exceeding 100 is the drawing working. A pattern cannot tell those apart and must not try.
 *
 * THE HARD RULE this obeys: a gate that fires falsely is worse than no gate. Where a rule cannot be
 * correct for a whole family, it does not exist for that family — it is NOT kept alive with a
 * per-indicator exception list, because that is suppression wearing a ledger's clothes.
 */

/**
 * STEP 3's allow-list. Exact ids. Each carries the DEFINITION that forces the bound, so a reviewer
 * can check the claim without trusting me. Entries that merely derive from these are NOT here.
 */
export const ASSERTED_BOUNDS = [
  { id: 'rsi', plot: 'plot0', lo: 0, hi: 100,
    definition: '100 - 100/(1+RS), RS = avgGain/avgLoss >= 0, so the value is in [0,100] by construction' },
  { id: 'stoch', plot: 'plot0', lo: 0, hi: 100,
    definition: '100*(C-LL)/(HH-LL) with LL <= C <= HH over the same window' },
  { id: 'stoch-rsi', plot: 'plot0', lo: 0, hi: 100,
    definition: 'a stochastic taken over an RSI series; same bracket as any stochastic' },
  { id: 'williams-r', plot: 'plot0', lo: -100, hi: 0,
    definition: '-100*(HH-C)/(HH-LL); it is the stochastic measured downward, hence [-100,0]' },
  { id: 'mfi', plot: 'plot0', lo: 0, hi: 100,
    definition: '100 - 100/(1+moneyRatio), moneyRatio >= 0' },
  { id: 'chande-mo', plot: 'plot0', lo: -100, hi: 100,
    definition: '100*(sumUp-sumDown)/(sumUp+sumDown), a signed share of total movement' },
  { id: 'ultimate-osc', plot: 'plot0', lo: 0, hi: 100,
    definition: 'a weighted average of three buying-pressure ratios, each in [0,1], scaled by 100' },
  { id: 'chaikin-mf', plot: 'plot0', lo: -1, hi: 1,
    definition: 'sum(mfVolume)/sum(volume) with |mfMultiplier| <= 1' },
  { id: 'stochastic-momentum-index', plot: 'plot0', lo: -100, hi: 100,
    definition: '100 * (C - midpoint) / (range/2); the distance to the midpoint is at most half the range' },
  { id: 'laguerre-rsi', plot: 'plot0', lo: 0, hi: 1,
    definition: 'a Laguerre-filtered RSI expressed as a unit fraction, NOT scaled by 100' },
  { id: 'aroon', plot: null, lo: 0, hi: 100,
    definition: '100*(period - barsSinceExtreme)/period, and 0 <= barsSinceExtreme <= period' },
  { id: 'choppiness', plot: 'plot0', lo: 0, hi: 100,
    definition: '100*log10(sumTR/range)/log10(n); bounded because range <= sumTR' },
];

/**
 * Inverse Fisher Transform outputs. `(e^2x - 1)/(e^2x + 1)` is tanh, whose range is (-1, 1) for
 * every real input. This one IS safe as a family, because the bound comes from the transform and not
 * from what is fed into it — but it is still applied by exact id, because only measurement tells us
 * which entries actually end in the transform.
 */
export const IFT_BOUNDED = [
  { id: 'ift-stoch-rsi-cci', plot: 'plot0' },
  { id: 'premier-rsi', plot: 'plot0' },
  { id: 'premier-stochastic', plot: 'plot0' },
  // `fisher-transform` was in this list and was REMOVED. Measured [-7.60, 7.41], and the rule was
  // right to fire: Ehlers' Fisher Transform is 0.5*ln((1+x)/(1-x)) — the INVERSE of tanh, which is
  // UNBOUNDED. I asserted the wrong direction. The vendor is correct; my definition was not. This is
  // exactly why every entry above carries its definition in writing.
];
