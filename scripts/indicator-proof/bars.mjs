/**
 * The test series, and the SELF-CHECKS that make a null result mean something.
 *
 * An inertia sensor is only as honest as its input: an input that changes nothing on a constant
 * series, a series with no volume, or a series shorter than the indicator's window is not an inert
 * input, it is an unexercised one. Every property the sensor depends on is therefore ASSERTED here
 * rather than assumed, and `describeFixture` prints the measurement so the ledger can cite it.
 */

/** Deterministic PRNG — the census has to be reproducible bar for bar. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** The 8 SourceType projections the vendor's `type:'source'` inputs select between. */
export const SOURCE_TYPES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'];
const project = {
  open: (b) => b.open,
  high: (b) => b.high,
  low: (b) => b.low,
  close: (b) => b.close,
  hl2: (b) => (b.high + b.low) / 2,
  hlc3: (b) => (b.high + b.low + b.close) / 3,
  ohlc4: (b) => (b.open + b.high + b.low + b.close) / 4,
  hlcc4: (b) => (b.high + b.low + b.close + b.close) / 4,
};

/**
 * A regime-switching series: sustained trend up, sharp reversal down, chop, trend up again, with
 * two declared gaps and a volume profile that is neither constant nor monotone.
 */
export function makeBars({ count, stepSec, startTime, seed, base, drift, vol }) {
  const rnd = lcg(seed);
  const bars = [];
  let price = base;
  for (let i = 0; i < count; i += 1) {
    // Four regimes across the series, so momentum studies see both extremes and a flat middle.
    const phase = Math.floor((i * 4) / count);
    const trend = [drift, -drift * 1.4, 0, drift * 0.8][phase];
    price *= 1 + trend + (rnd() - 0.5) * vol;
    price += Math.sin(i / 11) * base * 0.0015; // a cycle no window length divides evenly

    // Gaps: the open leaves the previous bar's range entirely. Gap studies need one of each sign.
    const gapUp = i === Math.floor(count * 0.31);
    const gapDown = i === Math.floor(count * 0.67);
    const openBias = gapUp ? 1.03 : gapDown ? 0.97 : 1 + (rnd() - 0.5) * 0.002;

    const open = price * openBias;
    const close = open * (1 + (rnd() - 0.5) * vol * 1.3);
    // Wicks on BOTH sides always, so high>max(o,c) and low<min(o,c) strictly — this is what makes
    // hl2/hlc3/ohlc4/hlcc4 distinct from close and from each other.
    const high = Math.max(open, close) * (1 + 0.0008 + rnd() * vol * 0.7);
    const low = Math.min(open, close) * (1 - 0.0008 - rnd() * vol * 0.7);
    price = close;
    // Volume: a base cycle, a random component and periodic spikes. Never zero, never constant.
    const volume = Math.round(1000 + 800 * Math.sin(i / 7) + rnd() * 2500 + (i % 23 === 0 ? 9000 : 0));
    bars.push({ time: startTime + i * stepSec, open, high, low, close, volume });
  }
  return bars;
}

/** Every property the sensor's null result depends on, measured rather than assumed. */
export function describeFixture(name, bars) {
  const n = bars.length;
  const fail = [];
  const check = (label, ok, detail) => {
    if (!ok) fail.push(label + (detail ? ` (${detail})` : ''));
    return { label, ok, detail };
  };
  const rows = [];

  rows.push(check('ascending time grid', bars.every((b, i) => i === 0 || b.time > bars[i - 1].time)));
  rows.push(check('all closes distinct', new Set(bars.map((b) => b.close)).size === n,
    `${new Set(bars.map((b) => b.close)).size}/${n}`));
  rows.push(check('no adjacent equal close', bars.every((b, i) => i === 0 || b.close !== bars[i - 1].close)));
  rows.push(check('strict wicks: high>max(o,c) and low<min(o,c)',
    bars.every((b) => b.high > Math.max(b.open, b.close) && b.low < Math.min(b.open, b.close))));

  // THE property `type:'source'` inertia depends on: the 8 projections must be pairwise distinct.
  let collide = '';
  for (let a = 0; a < SOURCE_TYPES.length && !collide; a += 1) {
    for (let b = a + 1; b < SOURCE_TYPES.length; b += 1) {
      const sa = bars.map(project[SOURCE_TYPES[a]]);
      const sb = bars.map(project[SOURCE_TYPES[b]]);
      if (sa.every((v, i) => v === sb[i])) { collide = `${SOURCE_TYPES[a]}==${SOURCE_TYPES[b]}`; break; }
    }
  }
  rows.push(check('8 source projections pairwise distinct', collide === '', collide));

  const ups = bars.filter((b) => b.close > b.open).length;
  const downs = bars.filter((b) => b.close < b.open).length;
  rows.push(check('both up and down bars', ups > n * 0.2 && downs > n * 0.2, `${ups} up / ${downs} down`));

  const vols = bars.map((b) => b.volume);
  rows.push(check('volume positive and non-constant',
    vols.every((v) => v > 0) && new Set(vols).size > n * 0.5, `${new Set(vols).size} distinct`));

  const gapsUp = bars.filter((b, i) => i > 0 && b.open > bars[i - 1].high).length;
  const gapsDown = bars.filter((b, i) => i > 0 && b.open < bars[i - 1].low).length;
  rows.push(check('at least one gap of each sign', gapsUp >= 1 && gapsDown >= 1, `${gapsUp} up / ${gapsDown} down`));

  // Trend reversal: the series must both rise and fall over long stretches, or a momentum study
  // pinned at one extreme would answer identically to every parameter.
  const seg = Math.floor(n / 4);
  const legs = [0, 1, 2, 3].map((k) => bars[Math.min(n - 1, (k + 1) * seg - 1)].close / bars[k * seg].close - 1);
  rows.push(check('a rising leg and a falling leg', Math.max(...legs) > 0.05 && Math.min(...legs) < -0.05,
    legs.map((l) => (l * 100).toFixed(1) + '%').join(' ')));

  const hours = new Set(bars.map((b) => new Date(b.time * 1000).getUTCHours()));
  const days = (bars[n - 1].time - bars[0].time) / 86400;
  rows.push(check('spans >=24 distinct hours or >=28 days', hours.size >= 24 || days >= 28,
    `${hours.size} hours / ${days.toFixed(1)} days`));

  return { name, count: n, rows, ok: fail.length === 0, fail };
}

/** Fixture A: 1024 hourly bars = 42.7 days. Every hour of the day, more than one lunar cycle. */
export const FIXTURE_A = () => makeBars({
  count: 1024, stepSec: 3600, startTime: 1704067200, seed: 0x5eed1, base: 100, drift: 0.0016, vol: 0.011,
});
/** Fixture B: 640 daily bars = 1.75 years, a different regime, a different seed. Cross-check only. */
export const FIXTURE_B = () => makeBars({
  count: 640, stepSec: 86400, startTime: 1600000000, seed: 0xb0b, base: 4200, drift: 0.0028, vol: 0.026,
});
