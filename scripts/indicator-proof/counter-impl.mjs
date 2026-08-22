/**
 * ORACLE LAYER B — THE INDEPENDENT COUNTER-IMPLEMENTATION.
 *
 * These four functions are PORTED VERBATIM from `example/studies.ts` in this repository, with only
 * the TypeScript types and the `utcSeconds` brand removed. They were written from the definitions,
 * they predate this library, and their conventions are documented in their own comments — which is
 * exactly what makes them an oracle: two people arriving at the same number from different
 * directions is evidence; one implementation agreeing with itself is not.
 *
 * Their documented conventions, quoted from the source, because a difference of CONVENTION is not a
 * defect and the report has to be able to tell the two apart:
 *   movingAverage      "BEFORE THE WINDOW IS FULL THE POINT IS A GAP, not a partial average."
 *   exponentialAverage "SEEDED ON THE SIMPLE MEAN of the first `window` closes."
 *   relativeStrength   Wilder's smoothing.
 *   convergence        signal "smooths the LINE, not the price, so it is seeded once the line exists".
 */
export function movingAverage(bars, window) {
  const points = [];
  let sum = 0;
  for (let index = 0; index < bars.length; index += 1) {
    sum += bars[index].close;
    if (index >= window) sum -= bars[index - window].close;
    points.push(index < window - 1 ? { time: bars[index].time } : { time: bars[index].time, value: sum / window });
  }
  return points;
}

export function relativeStrength(bars, window) {
  const points = [];
  let gain = 0, loss = 0;
  for (let index = 0; index < bars.length; index += 1) {
    if (index === 0) { points.push({ time: bars[index].time }); continue; }
    const change = bars[index].close - bars[index - 1].close;
    const up = Math.max(change, 0), down = Math.max(-change, 0);
    if (index <= window) { gain += up / window; loss += down / window; points.push({ time: bars[index].time }); continue; }
    gain = (gain * (window - 1) + up) / window;
    loss = (loss * (window - 1) + down) / window;
    points.push({ time: bars[index].time, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
  }
  return points;
}

export function exponentialAverage(bars, window) {
  const points = [];
  const k = 2 / (window + 1);
  let average = 0, seed = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const close = bars[index].close;
    if (index < window) {
      seed += close;
      if (index < window - 1) { points.push({ time: bars[index].time }); continue; }
      average = seed / window;
    } else average = close * k + average * (1 - k);
    points.push({ time: bars[index].time, value: average });
  }
  return points;
}

const valueAt = (points, index) => {
  const p = points[index];
  return p !== undefined && 'value' in p ? p.value : null;
};

export function convergence(bars) {
  const fast = exponentialAverage(bars, 12);
  const slow = exponentialAverage(bars, 26);
  const line = bars.map((bar, index) => {
    const a = valueAt(fast, index), b = valueAt(slow, index);
    return a === null || b === null ? { time: bar.time } : { time: bar.time, value: a - b };
  });
  const started = line.findIndex((p) => 'value' in p);
  const signal = bars.map((bar) => ({ time: bar.time }));
  if (started >= 0) {
    const k = 2 / (9 + 1);
    let average = 0, seed = 0;
    for (let index = started; index < line.length; index += 1) {
      const value = valueAt(line, index);
      if (value === null) continue;
      const age = index - started;
      if (age < 9) { seed += value; if (age < 8) continue; average = seed / 9; }
      else average = value * k + average * (1 - k);
      signal[index] = { time: bars[index].time, value: average };
    }
  }
  const histogram = bars.map((bar, index) => {
    const a = valueAt(line, index), b = valueAt(signal, index);
    return a === null || b === null ? { time: bar.time } : { time: bar.time, value: a - b };
  });
  return { line, signal, histogram };
}
