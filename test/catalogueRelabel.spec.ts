/**
 * `relabelled` — a generic lane wearing the name and the guide of the study occupying it.
 *
 * The fixtures below are the SAME INPUTS the host's component suite feeds today, so the assertions
 * below are the host's assertions: equality of output across the move is stated, not presumed.
 */
import { relabelled, type RelabellablePane } from '../src/catalogue/relabel';
import { paneId, seriesId, type PaneSpec, type SeriesSpec } from '../src/domain/types';

const spec = (id: string, label: string): SeriesSpec => ({
  id: seriesId(id),
  label,
  shape: 'line',
  color: '#888888',
});

function pane(options: {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly string[];
  readonly referenceLine?: number;
}): RelabellablePane {
  const series = options.fields.map((field, index) => ({
    spec: spec(`${options.id}.s${index}`, `serie ${index}`),
    source: { field },
  }));
  const paneSpec: PaneSpec = {
    id: paneId(options.id),
    title: options.title,
    format: { kind: 'ratio', decimals: 2 },
    series: series.map((bound) => bound.spec),
    defaultVisible: true,
    ...(options.referenceLine === undefined ? {} : { referenceLine: options.referenceLine }),
  };
  return { spec: paneSpec, series };
}

const LANE = pane({ id: 'lane.0', title: 'Faixa 1', fields: ['lane.0.0'] });
const AUTHORED = pane({ id: 'flow', title: 'CVD', fields: ['cvd'], referenceLine: 0 });
const NO_LABELS: ReadonlyMap<string, string> = new Map();

describe('the guide the occupying study brings', () => {
  it('starts absent on a lane, because a lane is generic until a study occupies it', () => {
    // Control positive for the cases below: a lane that already declared a level would pass them
    // with nothing writing one.
    expect(LANE.spec.referenceLine).toBeUndefined();
  });

  it('writes the occupant study guide onto the lane', () => {
    expect(relabelled(LANE, NO_LABELS, 'RSI', 50).spec.referenceLine).toBe(50);
    // Zero is a level like any other, not the absence of one: MACD is read against it.
    expect(relabelled(LANE, NO_LABELS, 'MACD', 0).spec.referenceLine).toBe(0);
  });

  it('leaves the lane without a guide when the study declares none', () => {
    expect(relabelled(LANE, NO_LABELS, 'ATR', undefined).spec.referenceLine).toBeUndefined();
  });

  it('preserves the level a catalogue pane declared for itself', () => {
    expect(AUTHORED.spec.referenceLine).toBe(0);
    expect(relabelled(AUTHORED, NO_LABELS, null, undefined).spec.referenceLine).toBe(0);
  });

  it('preserves it through a REBUILD too, which is where the clause actually lives', () => {
    // The case above is satisfied by the early return — nothing is rebuilt, so the pane comes back
    // by identity and the preservation clause never runs. Erasing the level instead of keeping it
    // passed the whole suite. Forcing the rebuild with a matching label is what reaches the clause.
    const rebuilt = relabelled(AUTHORED, new Map([['cvd', 'CVD spot']]), null, undefined);

    expect(rebuilt).not.toBe(AUTHORED);
    expect(rebuilt.spec.series[0].label).toBe('CVD spot');
    expect(rebuilt.spec.referenceLine).toBe(0);
  });
});

describe('the labels', () => {
  it('renames the series bound to the field, and the pane title with it', () => {
    const renamed = relabelled(LANE, new Map([['lane.0.0', 'RSI']]), 'RSI', 50);

    expect(renamed.spec.series[0].label).toBe('RSI');
    expect(renamed.spec.title).toBe('RSI');
    // `spec.series` is rebuilt from the bound series, so the two views cannot drift apart.
    expect(renamed.series[0].spec.label).toBe('RSI');
  });

  it('leaves a series whose field is not named untouched', () => {
    const twoLanes = pane({ id: 'lane.1', title: 'Faixa 2', fields: ['a', 'b'] });
    const renamed = relabelled(twoLanes, new Map([['a', 'RSI']]), null, undefined);

    expect(renamed.spec.series.map((entry) => entry.label)).toEqual(['RSI', 'serie 1']);
  });

  it('returns the very same pane when there is nothing to change', () => {
    // Identity, not a structural clone: a fresh object every render is what re-creates the whole
    // series set downstream on a pass that changed nothing.
    expect(relabelled(LANE, NO_LABELS, null, undefined)).toBe(LANE);
  });

  it('never mutates the pane it was given', () => {
    const before = JSON.stringify(LANE);
    relabelled(LANE, new Map([['lane.0.0', 'RSI']]), 'RSI', 50);
    expect(JSON.stringify(LANE)).toBe(before);
  });
});
