/**
 * The alert rule, which is the only part of a user price line that can be wrong quietly.
 *
 * A line that draws in the wrong place is visible. An alert that fires on every bar after a crossing
 * is visible too, once, as a wall of notifications. The failure worth a test is the SILENT one: the
 * second crossing that never fires because the first one latched the level for good.
 */
import {
  ALERT_GRAB_PX,
  DEFAULT_PRICE_ALERT_STYLE,
  PriceAlertLines,
  armAlert,
  observePrice,
  sideOf,
  type PriceAlert,
} from '../src/alerts/priceAlerts';
import type { PriceLineHandle, PriceLineOptions, SeriesHandle } from '../src/port/chartApi';

const alert = (over: Partial<PriceAlert> = {}): PriceAlert => ({
  id: 'a',
  price: 100,
  side: null,
  triggered: false,
  ...over,
});

/** Feed a whole path and collect one entry per bar that produced a crossing. */
function walk(start: readonly PriceAlert[], path: readonly number[]): number[] {
  let current = start;
  const fires: number[] = [];
  path.forEach((price, index) => {
    const observation = observePrice(current, price);
    current = observation.alerts;
    if (observation.crossed.length > 0) fires.push(index);
  });
  return fires;
}

describe('sideOf', () => {
  it('puts a price exactly ON the level above it, so a resting price has one side and not two', () => {
    expect(sideOf(100, 100)).toBe('above');
    expect(sideOf(100.0001, 100)).toBe('above');
    expect(sideOf(99.9999, 100)).toBe('below');
  });
});

describe('observePrice', () => {
  it('does not fire on the FIRST reading, whichever side it lands on', () => {
    // Arming on the first observation is what makes a level added below the market silent. Firing
    // here would mean every new line fires the instant it is drawn.
    expect(observePrice([alert()], 120).crossed).toEqual([]);
    expect(observePrice([alert()], 80).crossed).toEqual([]);
    // CONTROL POSITIVE: the side WAS recorded, so the next reading has something to differ from.
    expect(observePrice([alert()], 120).alerts[0].side).toBe('above');
  });

  it('fires on the crossing and stays quiet for every bar that keeps the same side', () => {
    // Arm below, cross up at index 1, then stay above for four more bars.
    expect(walk([alert()], [90, 110, 111, 112, 113, 114])).toEqual([1]);
  });

  it('does NOT fire again on the way back — one arming is one event', () => {
    // 90 arms, 110 fires, 90 returns below. `triggered` is already set, so the return is silent.
    expect(walk([alert()], [90, 110, 90])).toEqual([1]);
  });

  it('re-arms when the level MOVES, and the next crossing of the new level fires', () => {
    const armed = observePrice([alert()], 90).alerts;
    const fired = observePrice(armed, 110);
    expect(fired.crossed).toHaveLength(1);

    // The line is dragged to 200: not crossed yet, whatever it did at 100.
    const moved = fired.alerts.map((a) => armAlert(a, 200));
    expect(walk(moved, [150, 250])).toEqual([1]);

    // CONTROL POSITIVE: WITHOUT the re-arm the same path is silent, because `triggered` survives.
    expect(walk(fired.alerts.map((a) => ({ ...a, price: 200 })), [150, 250])).toEqual([]);
  });

  it('refuses a non-finite reading instead of arming every level against it', () => {
    const armed = observePrice([alert()], 90).alerts;
    const seen = observePrice(armed, Number.NaN);

    expect(seen.crossed).toEqual([]);
    expect(seen.alerts).toBe(armed); // untouched, not rebuilt with a NaN side
    // CONTROL POSITIVE: `NaN >= 100` is false, so a version without the guard would record `below`,
    // which is the side it was already on — and then a real price above the level would look like a
    // crossing that never happened. Here the armed side survives.
    expect(seen.alerts[0].side).toBe('below');
  });

  it('decides each level independently within one reading', () => {
    const armed = observePrice([alert({ id: 'low', price: 100 }), alert({ id: 'high', price: 200 })], 150)
      .alerts;
    const crossed = observePrice(armed, 250).crossed;

    // 150 -> 250 crosses 200 and leaves 100 on the side it was already on.
    expect(crossed.map((a) => a.id)).toEqual(['high']);
  });
});

interface LineRecord {
  readonly created: PriceLineOptions;
  readonly applied: Array<Partial<PriceLineOptions>>;
}

function fakeSeries(priceToY: (price: number) => number | null): {
  readonly series: SeriesHandle;
  readonly lines: LineRecord[];
} {
  const lines: LineRecord[] = [];
  const series: SeriesHandle = {
    priceToCoordinate: priceToY,
    coordinateToPrice: (coordinate) => 1000 - coordinate,
    setData: () => undefined,
    applyOptions: () => undefined,
    priceScale: () => ({ applyOptions: () => undefined }),
    createPriceLine: (options): PriceLineHandle => {
      const record: LineRecord = { created: options, applied: [] };
      lines.push(record);
      return { applyOptions: (next) => record.applied.push(next) };
    },
    removePriceLine: () => undefined,
    attachPrimitive: () => undefined,
    detachPrimitive: () => undefined,
  };
  return { series, lines };
}

describe('PriceAlertLines', () => {
  it('grabs a line within the grab radius and refuses one outside it', () => {
    const { series } = fakeSeries((price) => 1000 - price);
    const lines = new PriceAlertLines(series);
    lines.add(900); // y = 100

    expect(lines.hitTest(100 + ALERT_GRAB_PX)).not.toBeNull();
    // CONTROL POSITIVE: one pixel further is not a grab. Without a radius every press anywhere in
    // the pane would seize a line and the chart would never pan again.
    expect(lines.hitTest(100 + ALERT_GRAB_PX + 1)).toBeNull();
    expect(lines.beginDrag(100 + ALERT_GRAB_PX + 1)).toBe(false);
    expect(lines.isDragging()).toBe(false);
  });

  it('re-styles a line when its alert fires, and labels it as fired', () => {
    const { series, lines: drawn } = fakeSeries((price) => 1000 - price);
    const lines = new PriceAlertLines(series);
    lines.add(100);

    expect(drawn[0].created.color).toBe(DEFAULT_PRICE_ALERT_STYLE.idleColor);
    lines.observe(90);
    expect(drawn[0].applied).toEqual([]); // armed, not fired: nothing repainted

    const crossed = lines.observe(110);
    expect(crossed).toHaveLength(1);
    expect(drawn[0].applied.at(-1)?.color).toBe(DEFAULT_PRICE_ALERT_STYLE.firedColor);
    expect(drawn[0].applied.at(-1)?.title).toContain('✓');
  });

  it('moves the dragged line to the pointer and re-arms it there', () => {
    const { series, lines: drawn } = fakeSeries((price) => 1000 - price);
    const lines = new PriceAlertLines(series);
    lines.add(900);

    expect(lines.beginDrag(100)).toBe(true);
    expect(lines.dragTo(300)).toBe(700); // the fake maps y -> 1000 - y
    expect(lines.all()[0].price).toBe(700);
    expect(lines.all()[0].side).toBeNull();
    lines.endDrag();
    expect(lines.isDragging()).toBe(false);
    expect(drawn[0].applied.some((options) => options.price === 700)).toBe(true);
  });

  it('lists levels highest first and forgets a removed one entirely', () => {
    const { series } = fakeSeries(() => 0);
    const lines = new PriceAlertLines(series);
    const low = lines.add(100);
    lines.add(300);
    lines.add(200);

    expect(lines.all().map((a) => a.price)).toEqual([300, 200, 100]);
    lines.remove(low.id);
    expect(lines.all().map((a) => a.price)).toEqual([300, 200]);
    lines.clear();
    expect(lines.all()).toEqual([]);
  });

  it('skips a level the scale cannot place instead of grabbing it at the edge', () => {
    // Off-scale is `null`, not a clamped coordinate. A clamped one would sit at the pane boundary and
    // be grabbable there, which is a line the user cannot see answering a press they did not aim.
    const { series } = fakeSeries((price) => (price > 500 ? null : 1000 - price));
    const lines = new PriceAlertLines(series);
    lines.add(900);
    lines.add(100);

    expect(lines.hitTest(0)).toBeNull();
    // CONTROL POSITIVE: the level that IS on scale is still grabbable, so the null above is the
    // off-scale rule and not the hit test failing outright.
    expect(lines.hitTest(900)?.price).toBe(100);
  });
});
