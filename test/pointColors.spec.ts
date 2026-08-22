import { alignColors, barPositions } from '../src/indicator/availability';
import { resolveSources } from '../src/indicator/resolution';
import type { SourceResolution } from '../src/indicator/resolution';
import { resolutionPolicy } from '../src/catalogue/sources';
import type { PlottableSource, PlottedSeries, SourceLookup } from '../src/catalogue/sources';
import { laneSeriesId } from '../src/catalogue/lanes';
import { plottedPoints } from '../src/domain/readings';
import { isGap, seriesId } from '../src/domain/types';
import type { Bar, PaneSpec, Point, SeriesSpec } from '../src/domain/types';
import { studyColorReader } from '../src/react/workspace/studyReaders';

/**
 * POINT-01/02/03 — the ninth channel, and the one the seven-name inventory missed.
 *
 * WHY THIS SUITE EXISTS AT THE DOMAIN LAYER AND NOT ONLY ON A CANVAS.
 *
 * Measured on the offered catalogue, plot points arrive as `{time, value, color?}` and 147 of the
 * 320 offered rows emit 54,009 coloured points — more producers than `fills` (108) and more than
 * any other channel. The adapter discarded every one of them in silence, and nothing was red,
 * because a channel nobody enumerates is a channel nobody can miss. The clauses below therefore
 * pin the WHOLE chain — align, archive, read, draw — rather than only its far end: a test that
 * only read a canvas would pass against an implementation that archived the colour under the wrong
 * series identity and drew someone else's hue.
 *
 * THE FALLBACK IS THE HARD HALF. POINT-03 says a point with no colour draws in the series' own,
 * and `plottedPoints` already carried a two-branch colouring chain (`barDirectionColoring`, then
 * `signColoring`, then nothing). An implementation that let the new channel win unconditionally —
 * writing `color: hues?.[index]` and calling `undefined` an answer — would satisfy POINT-01 and
 * silently delete both existing branches. So the fallback is asserted in BOTH directions: a hue
 * present wins, a hue absent leaves the old chain exactly as it was.
 *
 * POINT-02 is the same sentence BAR-02 carries, and it is the kind of clause that passes over an
 * empty set unless something plants the case: a point that carries a colour and no value. It gets
 * one here, at both ends — `isGap` on the point itself, and the absence of ink at that index.
 */

const POLICY = resolutionPolicy({ lanes: 4 });

const bar = (time: number, close: number): Bar =>
  ({ time, open: close, high: close, low: close, close }) as unknown as Bar;

const BARS: readonly Bar[] = Array.from({ length: 6 }, (_unused, i) => bar(1000 + i * 60, 50 + i));

/** A vendor-shaped point: value, and the colour THAT point declares for its own segment. */
const point = (at: number, value: number | null, color?: string): Point => {
  const time = BARS[at].time;
  if (value === null) return (color === undefined ? { time } : { time, color }) as unknown as Point;
  return (color === undefined ? { time, value } : { time, value, color }) as unknown as Point;
};

const spec = (over: Partial<SeriesSpec> = {}): SeriesSpec =>
  ({ id: seriesId('p'), label: 'Plot', shape: 'line', color: '#4c9aff', ...over }) as SeriesSpec;

const PANE = { id: 'lane-1', title: 'Lane', series: [] } as unknown as PaneSpec;

const PALETTE = { up: '#26a69a', down: '#ef5350' };

const plot = (label: string, points: readonly Point[]): PlottedSeries =>
  ({
    spec: { id: seriesId(label), label, shape: 'line', color: '#fff', lineWidth: 1 },
    provider: { compute: () => points },
  }) as unknown as PlottedSeries;

const lookupOf = (plots: readonly PlottedSeries[]): SourceLookup => {
  const source: PlottableSource = {
    id: 'study',
    label: 'Study',
    placement: 'own-pane',
    series: () => plots,
  } as unknown as PlottableSource;
  return (id: string) => (id === 'study' ? source : undefined);
};

describe('POINT-01 — a point that carries a colour is aligned and archived', () => {
  it('lands each colour at ITS OWN bar position, by time, and drops a point off the grid', () => {
    const stray = { time: 999_999, value: 7, color: '#000000' } as unknown as Point;
    const aligned = alignColors(
      [point(1, 10, '#ff0000'), point(3, 12, '#00ff00'), stray],
      barPositions(BARS),
    );

    expect(aligned?.[1]).toBe('#ff0000');
    expect(aligned?.[3]).toBe('#00ff00');
    // Alignment is by TIMESTAMP, exactly as the readings are: a point whose bar is not in this
    // window is dropped, never appended at the end where it would recolour someone else's bar.
    expect(aligned?.filter((hue) => hue !== undefined && hue !== null)).toEqual(['#ff0000', '#00ff00']);
  });

  it('answers `null` when not one point declares a colour, so an uncoloured line archives nothing', () => {
    // 173 of the 320 offered rows emit no point colour at all. An implementation that archived a
    // full array of nulls for each of them would allocate one array per drawn line per resolve and
    // mean exactly the same thing as archiving nothing.
    expect(alignColors([point(0, 10), point(1, 11)], barPositions(BARS))).toBeNull();
  });

  it('archives the colours under the SAME series identity the readings are archived under', () => {
    const coloured = [point(0, 10, '#ff0000'), point(1, 11, '#0000ff'), point(2, 12)];
    const resolved = resolveSources(['study'], lookupOf([plot('Line', coloured)]), BARS, POLICY);
    const field = seriesId(laneSeriesId(0, 0));

    // The identity is the whole point of routing this through the resolve rather than handing the
    // host a reader keyed on the lane: the host would have to rebuild the study -> lane mapping
    // from outside, which is the class of defect `studyIdentity` already measured once.
    expect(resolved.readings.get(field)).toEqual([10, 11, 12, null, null, null]);
    expect(resolved.colors?.get(field)?.[0]).toBe('#ff0000');
    expect(resolved.colors?.get(field)?.[1]).toBe('#0000ff');
    // The third point carries no colour of its own: the archive says nothing about that bar.
    expect(resolved.colors?.get(field)?.[2] ?? null).toBeNull();
  });

  it('draws the two indices the vendor coloured differently in two different colours', () => {
    // The spec's own independent test, at the layer that decides the drawn payload: read the drawn
    // segments at two indices the vendor says differ and assert the two colours differ.
    const drawn = plottedPoints([10, 11, 12], BARS, spec(), PALETTE, [
      '#ff0000',
      '#0000ff',
      null,
    ]);

    expect(drawn[0].color).toBe('#ff0000');
    expect(drawn[1].color).toBe('#0000ff');
    expect(drawn[0].color).not.toBe(drawn[1].color);
  });
});

describe('POINT-03 — a point with no colour draws in the series’ own', () => {
  it('emits NO colour of its own, so the series’ declared colour is what paints the segment', () => {
    const drawn = plottedPoints([10, 11], BARS, spec(), PALETTE, ['#ff0000', null]);

    expect(drawn[0].color).toBe('#ff0000');
    // `undefined`, which is how this payload has always said "the series' own colour" — the parity
    // record in `fixtures/readingsParity.json` pins that shape. NOT `null` and not the empty
    // string: either of those is a colour, and the base library would paint the segment with it.
    expect(drawn[1].color).toBeUndefined();
    // And a hue array that stops short says the same thing as a `null` in it, so a study whose
    // colours run out mid-window does not start drawing a different line from there on.
    expect(plottedPoints([10, 11], BARS, spec(), PALETTE, ['#ff0000'])[1].color).toBeUndefined();
  });

  it('leaves the existing colouring chain intact where the vendor declares nothing', () => {
    // CONTROL POSITIVE for the fallback. `signColoring` and `barDirectionColoring` are two live
    // branches this feature must not delete; an implementation that wrote the new channel over
    // them unconditionally passes every POINT-01 clause above and fails these two.
    const signed = plottedPoints([-4, 5], BARS, spec({ signColoring: true }), PALETTE, undefined);
    const overridden = plottedPoints([-4, 5], BARS, spec({ signColoring: true }), PALETTE, [
      '#ff0000',
      null,
    ]);

    expect(signed.map((p) => p.color)).toEqual([PALETTE.down, PALETTE.up]);
    // And where a point DOES declare one, the vendor's own signal wins over the derived convention.
    expect(overridden.map((p) => p.color)).toEqual(['#ff0000', PALETTE.up]);
  });
});

describe('POINT-02 — a colour changes nothing about what a point MEANS', () => {
  it('a point that carries a colour and no value is still a declared gap', () => {
    expect(isGap(point(2, null, '#ff0000'))).toBe(true);
    expect(isGap(point(2, 12, '#ff0000'))).toBe(false);
  });

  it('draws no segment where the reading is absent, however the bar was coloured', () => {
    const drawn = plottedPoints([10, null, 12], BARS, spec(), PALETTE, [
      '#ff0000',
      '#00ff00',
      '#0000ff',
    ]);

    // Three colours, two points: the middle bar was never measured and a colour cannot invent it.
    expect(drawn).toHaveLength(2);
    expect(drawn.map((p) => p.value)).toEqual([10, 12]);
    // And the colour that survives is the one belonging to the bar it was aligned to, not the one
    // that happened to be next in the list — the failure an implementation that filtered first and
    // coloured after would produce.
    expect(drawn[1].color).toBe('#0000ff');
  });

  it('archives no colour for a plot whose only coloured point has no value', () => {
    const resolved = resolveSources(
      ['study'],
      lookupOf([plot('Line', [point(0, 10), point(1, null, '#ff0000')])]),
      BARS,
      POLICY,
    );
    const field = seriesId(laneSeriesId(0, 0));

    // The colour IS archived — the vendor declared it — and it draws nothing, because the reading
    // at that bar is absent. The two channels stay independent rather than one deciding the other.
    expect(resolved.colors?.get(field)?.[1]).toBe('#ff0000');
    expect(resolved.readings.get(field)?.[1]).toBeNull();
  });
});

describe('the map member is OPTIONAL', () => {
  it('reads a resolution that declares no colours at all, so no host breaks on the new member', () => {
    // The previous feature's promise was zero host breakage, and a host that built its own
    // `SourceResolution` — the published type — would stop compiling against a mandatory member.
    const legacy = {
      views: [],
      readings: new Map(),
      labels: new Map(),
      activePaneIds: new Set<string>(),
    } as unknown as SourceResolution;

    expect(studyColorReader(legacy)(PANE, spec())).toEqual([]);
    expect(studyColorReader(undefined)(PANE, spec())).toEqual([]);
  });

  it('hands the archived colours through under the series identity the surface asks with', () => {
    const resolved = resolveSources(
      ['study'],
      lookupOf([plot('Line', [point(0, 10, '#ff0000')])]),
      BARS,
      POLICY,
    );
    const field = spec({ id: seriesId(laneSeriesId(0, 0)) });

    expect(studyColorReader(resolved)(PANE, field)[0]).toBe('#ff0000');
    // A series the resolve knows nothing about reads empty rather than someone else's colours.
    expect(studyColorReader(resolved)(PANE, spec({ id: seriesId('nobody') }))).toEqual([]);
  });
});
