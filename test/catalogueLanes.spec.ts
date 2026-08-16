/**
 * LMC-41 — the minters rise, the palette and the count do not.
 *
 * TWO CLAIMS, AND THE SECOND IS THE ONE THAT DECAYS QUIETLY. The first is a wire format: these
 * identifiers already name fields in persisted rows, so a change of shape is a change of stored
 * data and is pinned to the character. The second is that nothing in this module holds a colour of
 * its own — a baked-in default would satisfy every assertion about the shape of a lane and would
 * still be the palette that was supposed to stay with the consumer. It is tested by driving the
 * same lane through two different palettes and requiring both to come back.
 */

import { bindPane } from '../src/catalogue/draft';
import { laneDraft, lanePaneId, laneSeriesId, priceOverlaySeriesId } from '../src/catalogue/lanes';
import { seriesId } from '../src/domain/types';

const FORMAT = { kind: 'ratio', decimals: 2 } as const;
const PALETTE = ['#4fc3f7', '#ffb74d'];

const options = (over: Partial<Parameters<typeof laneDraft<string>>[0]> = {}) => ({
  lane: 0,
  title: 'Lane',
  format: FORMAT,
  plots: 4,
  colors: PALETTE,
  bind: (field: string) => field,
  ...over,
});

describe('the minters — one-based text over a zero-based index, pinned as a wire format', () => {
  it('names the lane pane, counting from one', () => {
    expect(lanePaneId(0)).toBe('ind1');
    expect(lanePaneId(3)).toBe('ind4');
  });

  it('names a plot within a lane, both counted from one', () => {
    expect(laneSeriesId(0, 0)).toBe('ind1p1');
    expect(laneSeriesId(3, 2)).toBe('ind4p3');
  });

  it('names the same plot drawn OVER the price action with a distinct identifier', () => {
    expect(priceOverlaySeriesId(0, 0)).toBe('ovl1p1');
    expect(priceOverlaySeriesId(3, 2)).toBe('ovl4p3');
  });

  it('BOTH BRANCHES OF THE CHOICE ARE HERE, and they never collide for any lane and plot', () => {
    // The call site picks one of the two by asking whether the study rides the price scale. Split
    // the pair across the boundary and one half can be renumbered without the other: the symptom
    // is a reading that never reaches the legend, and there is no error anywhere.
    const minted = new Set<string>();
    for (let lane = 0; lane < 4; lane += 1) {
      for (let plot = 0; plot < 4; plot += 1) {
        minted.add(laneSeriesId(lane, plot));
        minted.add(priceOverlaySeriesId(lane, plot));
      }
    }
    expect(minted.size).toBe(32);
  });
});

describe('the empty lane — shape from the library, colour and count from the consumer', () => {
  it('draws as many lines as the count it was given, and no more', () => {
    expect(laneDraft(options({ plots: 4 })).series).toHaveLength(4);
    expect(laneDraft(options({ plots: 1 })).series).toHaveLength(1);
  });

  it('cycles the palette it was HANDED — a second palette changes every colour', () => {
    // The discriminating half. A module holding a default palette would pass every assertion about
    // the shape of a lane and would still be the thing that was supposed to stay outside.
    expect(laneDraft(options()).series.map((s) => s.color)).toEqual([
      '#4fc3f7',
      '#ffb74d',
      '#4fc3f7',
      '#ffb74d',
    ]);
    expect(laneDraft(options({ colors: ['#000000'] })).series.map((s) => s.color)).toEqual([
      '#000000',
      '#000000',
      '#000000',
      '#000000',
    ]);
  });

  it('refuses an empty palette instead of handing back a line with no colour', () => {
    expect(() => laneDraft(options({ colors: [] }))).toThrow(/palette is empty/);
  });

  it('is born collapsed, and every line is born unlabelled', () => {
    // Visibility is derived from what occupies the lane. A lane that started visible would hold
    // open space on screen for a study that does not exist yet.
    const draft = laneDraft(options());
    expect(draft.defaultVisible).toBe(false);
    expect(draft.series.map((s) => s.label)).toEqual(['', '', '', '']);
  });

  it('carries the identifier, the title, the format and the target height it was given', () => {
    const draft = laneDraft(options({ lane: 2, title: 'Lane', targetHeightPx: 108 }));
    expect(draft.id).toBe('ind3');
    expect(draft.title).toBe('Lane');
    expect(draft.format).toEqual(FORMAT);
    expect(draft.targetHeightPx).toBe(108);
  });

  it('omits the target height when none was declared, rather than inventing one', () => {
    expect(laneDraft(options())).not.toHaveProperty('targetHeightPx');
  });

  it('keys each binding by the field it just minted', () => {
    // The consumer's payload is built FROM the identifier, so a line and the payload that feeds it
    // cannot end up naming different fields.
    expect(laneDraft(options({ lane: 1 })).series.map((s) => s.binding)).toEqual([
      'ind2p1',
      'ind2p2',
      'ind2p3',
      'ind2p4',
    ]);
  });

  it('feeds the generic constructor, so the drawn lane carries the minted identifiers', () => {
    const bound = bindPane(laneDraft(options({ lane: 0, plots: 2 })));
    expect(bound.spec.series.map((s) => s.id)).toEqual([seriesId('ind1p1'), seriesId('ind1p2')]);
    expect(bound.spec.defaultVisible).toBe(false);
  });
});
