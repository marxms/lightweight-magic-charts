/**
 * LMC-41 — the assembly of a catalogue rises; the catalogue itself does not.
 *
 * The claim under test is the one that decays silently. A pane carries its series twice — once as
 * the list the consumer keeps in order to read numbers, once as the list the library draws — and
 * nothing in a type stops those two from describing different sets. The constructor derives the
 * second from the first, and the tests below assert the DERIVATION by identity rather than by
 * length: two lists of equal length that hold different objects would satisfy a count and would
 * still be the drift this exists to prevent.
 */

import { bindPane, bindSeries } from '../src/catalogue/draft';
import { paneId, seriesId, type PaneSpec, type SeriesSpec } from '../src/domain/types';

/** A payload the library has no opinion about, which is the whole point of the type parameter. */
interface Binding {
  readonly from: string;
  readonly slot: number;
}

const line = (id: string, binding: Binding) =>
  ({
    id,
    label: id.toUpperCase(),
    shape: 'line' as const,
    color: '#4fc3f7',
    lineWidth: 1 as const,
    binding,
  });

describe('bindSeries — the brand is minted here, and the payload stays out of the spec', () => {
  it('mints the branded identifier from the plain string the consumer wrote', () => {
    const bound = bindSeries(line('alpha', { from: 'left', slot: 0 }));
    expect(bound.spec.id).toBe(seriesId('alpha'));
  });

  it('carries every drawn field through untouched', () => {
    const bound = bindSeries(line('alpha', { from: 'left', slot: 0 }));
    expect(bound.spec).toEqual({
      id: seriesId('alpha'),
      label: 'ALPHA',
      shape: 'line',
      color: '#4fc3f7',
      lineWidth: 1,
    });
  });

  it('keeps the binding OUT of the spec, and returns it beside it', () => {
    // The spec is what the library draws. A payload leaking into it would be handed to the chart,
    // and the consumer's vocabulary would cross a boundary this package exists to hold.
    const binding = { from: 'left', slot: 2 };
    const bound = bindSeries(line('alpha', binding));
    expect(bound.binding).toBe(binding);
    expect(Object.keys(bound.spec)).not.toContain('binding');
  });
});

describe('bindPane — the drawn list is DERIVED from the bound list', () => {
  const draft = {
    id: 'stack',
    title: 'Stack',
    format: { kind: 'ratio', decimals: 2 } as const,
    defaultVisible: true,
    series: [line('alpha', { from: 'left', slot: 0 }), line('beta', { from: 'right', slot: 1 })],
  };

  it('mints the pane identifier and carries the remaining declaration through', () => {
    const bound = bindPane(draft);
    expect(bound.spec.id).toBe(paneId('stack'));
    expect(bound.spec.title).toBe('Stack');
    expect(bound.spec.format).toEqual({ kind: 'ratio', decimals: 2 });
    expect(bound.spec.defaultVisible).toBe(true);
  });

  it('INVARIANT: every spec in the drawn list IS the spec of the bound series at that position', () => {
    // By identity, not by value. Equal-looking objects would pass a structural comparison while
    // still being two declarations of one series, which is exactly the drift being refused.
    const bound = bindPane(draft);
    expect(bound.spec.series).toHaveLength(2);
    bound.spec.series.forEach((spec, at) => {
      expect(spec).toBe(bound.series[at].spec);
    });
  });

  it('holds the invariant with one series and with none', () => {
    // The empty pane is the case a length-based assertion passes vacuously, and a pre-created lane
    // that no study occupies is exactly that pane.
    const one = bindPane({ ...draft, series: [line('alpha', { from: 'left', slot: 0 })] });
    expect(one.spec.series).toEqual([one.series[0].spec]);

    const none = bindPane({ ...draft, series: [] });
    expect(none.spec.series).toEqual([]);
    expect(none.series).toEqual([]);
  });

  it('POSITIVE CONTROL: the invariant FAILS on a pane whose two lists were written separately', () => {
    // The type still admits a hand-written `PaneSpec`, so the assertion above is not vacuous: here
    // the drawn list holds a spec no bound series produced, and the identity check catches it.
    const bound = bindPane(draft);
    const smuggled: SeriesSpec = { ...bound.series[0].spec };
    const handWritten: PaneSpec = { ...bound.spec, series: [smuggled, bound.series[1].spec] };
    expect(handWritten.series[0]).toEqual(bound.series[0].spec);
    expect(handWritten.series[0]).not.toBe(bound.series[0].spec);
  });
});
