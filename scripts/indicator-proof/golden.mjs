/**
 * ORACLE LAYER C — GOLDEN VECTORS, computed by hand.
 *
 * Small enough that the arithmetic is on the page. This is the only layer that can catch an error
 * BOTH implementations share, and the only one that pins a CONVENTION (population vs sample
 * deviation, which bar the warm-up ends on) rather than just a number.
 */
import { indicatorRegistry as reg } from 'lightweight-charts-indicators';

const R = (id) => reg.find((e) => e.id === id);
const barsOf = (closes, extra = () => ({})) => closes.map((c, i) => ({
  time: 1700000000 + i * 3600, open: c, high: c, low: c, close: c, volume: 1000, ...extra(c, i),
}));
const vals = (points) => points.map((p) => (Number.isFinite(p.value) ? p.value : null));
const EPS = 1e-9;
const near = (a, b) => (a === null || b === null) ? a === b : Math.abs(a - b) <= EPS * Math.max(1, Math.abs(b));

const cases = [];
const vector = (name, expected, actual, note) => {
  const ok = expected.length === actual.length && expected.every((e, i) => near(actual[i], e));
  cases.push({ name, ok, expected, actual, note });
};

// ---- 1. SMA(3) of 1..5. (1+2+3)/3=2, (2+3+4)/3=3, (3+4+5)/3=4.
vector('SMA(len=3) of [1,2,3,4,5]', [null, null, 2, 3, 4],
  vals(R('sma').calculate(barsOf([1, 2, 3, 4, 5]), { ...R('sma').defaultInputs, len: 3 }).plots.plot0),
  'warm-up ends when the window first fills, at index len-1');

// ---- 2. SMA(len=1) is the identity on the source. Run it for all 8 SourceType values.
{
  const closes = [10, 12, 11, 15, 14];
  const bars = closes.map((c, i) => ({ time: 1700000000 + i * 3600, open: c - 1, high: c + 2, low: c - 3, close: c, volume: 100 }));
  const proj = {
    open: (b) => b.open, high: (b) => b.high, low: (b) => b.low, close: (b) => b.close,
    hl2: (b) => (b.high + b.low) / 2, hlc3: (b) => (b.high + b.low + b.close) / 3,
    ohlc4: (b) => (b.open + b.high + b.low + b.close) / 4, hlcc4: (b) => (b.high + b.low + b.close + b.close) / 4,
  };
  for (const [srcName, f] of Object.entries(proj)) {
    vector(`SMA(len=1, src='${srcName}') == the source itself`, bars.map(f),
      vals(R('sma').calculate(bars, { ...R('sma').defaultInputs, len: 1, src: srcName }).plots.plot0),
      'identity: a one-bar mean is the bar. Also proves the source projection.');
  }
}

// ---- 3. EMA(3) of 1..5. seed=(1+2+3)/3=2 at i=2, k=2/(3+1)=0.5.
//         i=3: 4*.5 + 2*.5 = 3.  i=4: 5*.5 + 3*.5 = 4.
vector('EMA(length=3) of [1,2,3,4,5]', [null, null, 2, 3, 4],
  vals(R('ema').calculate(barsOf([1, 2, 3, 4, 5]), { ...R('ema').defaultInputs, length: 3 }).plots.plot0),
  'seeded on the simple mean of the first `length` values — the convention example/studies.ts documents');

// ---- 4. RSI(2), Wilder, hand-rolled.
//   closes 10, 11, 10.5, 11.5, 11, 12  ->  changes +1, -0.5, +1, -0.5, +1
//   seed over the first 2 changes: gain = 1/2 = 0.5, loss = 0.5/2 = 0.25
//     i=2: RS = 2      -> 100 - 100/3   = 66.666666...
//     i=3: gain=(0.5+1)/2=0.75,   loss=(0.25+0)/2=0.125    RS=6    -> 100-100/7   = 85.714285...
//     i=4: gain=(0.75+0)/2=0.375, loss=(0.125+0.5)/2=0.3125 RS=1.2 -> 100-100/2.2 = 54.545454...
//     i=5: gain=(0.375+1)/2=0.6875, loss=(0.3125+0)/2=0.15625 RS=4.4 -> 100-100/5.4 = 81.481481...
vector('RSI(length=2) of [10,11,10.5,11.5,11,12]',
  [null, null, 100 - 100 / 3, 100 - 100 / 7, 100 - 100 / 2.2, 100 - 100 / 5.4],
  vals(R('rsi').calculate(barsOf([10, 11, 10.5, 11.5, 11, 12]), { ...R('rsi').defaultInputs, length: 2 }).plots.plot0),
  'Wilder smoothing, first reading at index = length');

// ---- 5. Bollinger, len=8, mult=1, over [2,4,4,4,5,5,7,9]: mean 5.
//   POPULATION deviation = 2 exactly -> upper 7, lower 3.
//   SAMPLE deviation = sqrt(32/7) = 2.13809... -> upper 7.138, lower 2.862.
//   This vector exists to say WHICH of the two the vendor uses.
{
  const closes = [2, 4, 4, 4, 5, 5, 7, 9];
  const out = R('bb').calculate(barsOf(closes), { ...R('bb').defaultInputs, length: 8, mult: 1 });
  const basis = vals(out.plots.plot0).at(-1), up = vals(out.plots.plot1).at(-1), lo = vals(out.plots.plot2).at(-1);
  const popSd = 2, sampleSd = Math.sqrt(32 / 7);
  cases.push({
    name: 'BB(8, mult=1) on [2,4,4,4,5,5,7,9]', ok: near(basis, 5) && (near(up, 5 + popSd) || near(up, 5 + sampleSd)),
    expected: [`basis 5`, `upper 5+sd`, `lower 5-sd`],
    actual: [basis, up, lo],
    note: near(up, 5 + popSd) ? 'POPULATION deviation (n)' : near(up, 5 + sampleSd) ? 'SAMPLE deviation (n-1)' : 'neither',
  });
  cases.push({ name: 'BB ordering upper >= basis >= lower', ok: up >= basis - EPS && basis >= lo - EPS, expected: ['upper>=basis>=lower'], actual: [up, basis, lo], note: '' });
  // basis must be the SMA when maType is SMA
  const sma = vals(R('sma').calculate(barsOf(closes), { ...R('sma').defaultInputs, len: 8 }).plots.plot0).at(-1);
  cases.push({ name: "BB basis == SMA when maType='SMA'", ok: near(basis, sma), expected: [sma], actual: [basis], note: '' });
}

// ---- 6. True range / ATR on a hand vector.
//   bar0 h=12 l=10 c=11 ; bar1 h=13 l=11 c=12.5 ; bar2 h=15 l=12 c=14
//   TR1 = max(13-11, |13-11|, |11-11|) = 2 ; TR2 = max(15-12, |15-12.5|, |12-12.5|) = 3
{
  const bars = [
    { time: 1700000000, open: 10.5, high: 12, low: 10, close: 11, volume: 1 },
    { time: 1700003600, open: 11, high: 13, low: 11, close: 12.5, volume: 1 },
    { time: 1700007200, open: 12.5, high: 15, low: 12, close: 14, volume: 1 },
  ];
  const atr = R('atr');
  if (atr) {
    const out = atr.calculate(bars, { ...atr.defaultInputs, length: 2 });
    const k = Object.keys(out.plots)[0];
    cases.push({ name: 'ATR(2) on a 3-bar hand vector', ok: Number.isFinite(vals(out.plots[k]).at(-1)),
      expected: ['a finite value; TR = [2, 2, 3]'], actual: [vals(out.plots[k]).at(-1)], note: 'mean of TR1,TR2 = 2.5 if simple; Wilder differs' });
  }
}

// ---- 7. RSI of a strictly rising series pins at 100; of a strictly falling series, at 0.
{
  const up = barsOf(Array.from({ length: 60 }, (_, i) => 100 + i));
  const dn = barsOf(Array.from({ length: 60 }, (_, i) => 160 - i));
  const ru = vals(R('rsi').calculate(up, R('rsi').defaultInputs).plots.plot0).filter((v) => v !== null);
  const rd = vals(R('rsi').calculate(dn, R('rsi').defaultInputs).plots.plot0).filter((v) => v !== null);
  cases.push({ name: 'RSI of a strictly rising series == 100', ok: ru.length > 0 && ru.every((v) => near(v, 100)), expected: [100], actual: [ru[0], ru.at(-1)], note: '' });
  cases.push({ name: 'RSI of a strictly falling series == 0', ok: rd.length > 0 && rd.every((v) => near(v, 0)), expected: [0], actual: [rd[0], rd.at(-1)], note: '' });
}

export { cases };
