import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * PROOF-01 / PROOF-02 / PROOF-02a / LINES-04 — the generator stops keeping a list.
 *
 * WHAT WENT WRONG, MEASURED. `build-indicator-manifest.mjs` walked a hand-written list of NINE
 * channel names and asked `Array.isArray` of each. Two of the vendor's channels — `plotCandles` and
 * `tables` — arrive as OBJECTS, so the count came back zero and the manifest recorded that ten
 * offered rows emitted nothing at all. One of them, `madrid-trend-squeeze`, carried 2,970 drawable
 * candles. PROOF-01 reads "the manifest records zero dropped channels", and it would have passed
 * green over every one of them: a list of names cannot report the name that is not on it.
 *
 * So the enumeration comes from `Object.keys(result)` and an object payload counts like an array
 * one. The three members that are NOT a channel — `plots`, `hlines`, `metadata` — are named once,
 * and everything else is something asking to be drawn.
 *
 * WHY THE REFUSAL IS A FUNCTION OF (rows, widths) AND NOT A STEP INSIDE THE DERIVATION. The
 * generator derives the widths from the rows it writes, so over its own output the refusal set is
 * EMPTY BY CONSTRUCTION — a maximum is not exceeded by what it is the maximum of. That vacuity is
 * asserted below rather than assumed, because it is the whole reason the same function has to be
 * callable with the widths the COMMITTED file declares: there, a width that has stopped describing
 * the rows under it is a study drawing four of its twenty lines in silence, which is the defect this
 * feature exists to remove. One mechanism, two risks.
 *
 * THE MODULE IS DRIVEN THROUGH `node`, the way `sizeBudget.spec.ts` drives the size probe: it is an
 * `.mjs` the generator and the proof both import, and jest transforms only TypeScript. Importing a
 * transpiled copy would test a copy.
 */

const LIB_ROOT = join(__dirname, '..');
const SHAPE = join(LIB_ROOT, 'scripts', 'indicator-proof', 'manifest-shape.mjs');

const row = (id: string, placement: string, plots: number, channels?: Record<string, number>) =>
  JSON.stringify({
    id,
    placement,
    plotIds: Array.from({ length: plots }, (_unused, at) => `plot${at}`),
    ...(channels === undefined ? {} : { channels }),
  });

/** ONE spawn, every answer: the program is what costs the time, not the questions. */
const ANSWERS = (() => {
  const script = `
    import { channelsOf, refusalsOf, widthsOf, withdrawalFaults, withdrawalRefusal, HOST_CHANNELS, NOT_A_CHANNEL } from ${JSON.stringify(SHAPE)};
    const withdrawn = (ledger) => withdrawalFaults({
      offered: ['kept', 'bop', 'mass-index'],
      derived: new Set(['kept']),
      refused: new Map([['bop', 'planted rule'], ['mass-index', 'planted rule']]),
      ledger,
    });
    const rows = [
      ${row('wide', 'over-price', 5)},
      ${row('narrow', 'over-price', 2)},
      ${row('lane', 'own-pane', 3)},
    ];
    const out = {
      objectChannel: channelsOf({ plots: { a: [] }, plotCandles: { candle0: [1, 2, 3] } }),
      arrayChannel: channelsOf({ fills: [1, 2] }),
      unnamed: channelsOf({ somethingNobodyWrote: [1] }),
      notChannels: channelsOf({ plots: { a: [1] }, hlines: [1, 2], metadata: { title: 'x' } }),
      emptyChannel: channelsOf({ fills: [], bgColors: {} }),
      scalar: channelsOf({ fills: [1], someNumber: 7 }),
      derivedWidths: widthsOf(rows),
      overOwnDerived: refusalsOf(rows, widthsOf(rows)),
      overNarrowed: refusalsOf(rows, { overPrice: 4, ownPane: 3 }),
      perPlacement: refusalsOf(rows, { overPrice: 5, ownPane: 2 }),
      unknownChannel: refusalsOf([JSON.parse(${JSON.stringify(row('odd', 'own-pane', 1, { tables: 4 }))})], { overPrice: 5, ownPane: 5 }),
      knownChannel: refusalsOf([JSON.parse(${JSON.stringify(row('fine', 'own-pane', 1, { fills: 4 }))})], { overPrice: 5, ownPane: 5 }),
      hostChannels: [...HOST_CHANNELS].sort(),
      notAChannel: [...NOT_A_CHANNEL].sort(),
      undeclaredWithdrawal: withdrawn({ withdrawals: [] }),
      declaredWithdrawal: withdrawn({ withdrawals: [
        { id: 'bop', reason: 'the host stopped drawing it', measuredAt: '0.5.0' },
        { id: 'mass-index', reason: 'the host stopped drawing it', measuredAt: '0.5.0' },
      ] }),
      halfDeclaredWithdrawal: withdrawn({ withdrawals: [{ id: 'bop', reason: 'signed' }] }),
      blankReasonWithdrawal: withdrawn({ withdrawals: [
        { id: 'bop', reason: '   ' },
        { id: 'mass-index' },
      ] }),
      vanishedIsNotWithdrawn: withdrawalFaults({
        offered: ['gone'],
        derived: new Set([]),
        refused: new Map(),
        ledger: { withdrawals: [] },
      }),
      withdrawalMessage: withdrawalRefusal(withdrawn({ withdrawals: [] }), 'example/indicators/withdrawals.json'),
    };
    process.stdout.write(JSON.stringify(out));
  `;
  const run = spawnSync('node', ['--input-type=module', '-e', script], {
    cwd: LIB_ROOT,
    encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(`manifest-shape probe failed: ${run.stderr}`);
  return JSON.parse(run.stdout) as Record<string, never>;
})();

const answer = <T>(key: string): T => ANSWERS[key] as unknown as T;

interface Counted {
  readonly counts: Readonly<Record<string, number>>;
  readonly unknown: readonly string[];
}

interface Refusal {
  readonly id: string;
  readonly reason: string;
  readonly detail: string;
}

interface Withdrawal {
  readonly id: string;
  readonly measured: string;
}

describe('PROOF-02a — a channel that arrives as an object is counted like any other', () => {
  it('counts an OBJECT payload, which is the exact shape the list of nine missed', () => {
    // `Array.isArray({ candle0: [...] })` is false, and the whole defect is that one call: ten
    // offered rows emitted a `plotCandles` or a `tables` and the manifest declared they did not.
    const seen = answer<Counted>('objectChannel');

    // Verified by deletion: with the count written as `Array.isArray(v) ? v.length : 0` this line
    // reads `[]` — the channel is not spotted at all, which is precisely how it was invisible.
    expect(seen.unknown).toEqual(['plotCandles']);
    // And the array path still counts what is in it, so the fix is a widening and not a swap.
    expect(answer<Counted>('arrayChannel').counts).toEqual({ fills: 2 });
  });

  it('reports a channel name nobody ever wrote down, because it enumerates the RESULT', () => {
    // The list is the defect. A vendor release that adds a channel gets reported by a generator
    // that walks the result and is invisible to one that walks a list of names it wrote first.
    expect(answer<Counted>('unnamed').unknown).toEqual(['somethingNobodyWrote']);
  });

  it('leaves the three members that are not a channel alone', () => {
    // `plots` IS the lines, `hlines` is served by the guide, and `metadata` is the row's own name.
    // Counting them as undrawn channels would refuse all 310 rows on the first run.
    const seen = answer<Counted>('notChannels');

    expect(seen.counts).toEqual({});
    expect(seen.unknown).toEqual([]);
    expect(answer<string[]>('notAChannel')).toEqual(['hlines', 'metadata', 'plots']);
  });

  it('says nothing about an EMPTY channel, or about a member that is not a payload at all', () => {
    // An empty array is not an amputation — there is nothing in it to lose. And a scalar member is
    // not a channel: counting it would refuse a row for carrying a number.
    expect(answer<Counted>('emptyChannel')).toEqual({ counts: {}, unknown: [] });
    expect(answer<Counted>('scalar')).toEqual({ counts: { fills: 1 }, unknown: [] });
  });

  it('names the seven channels the host draws, so the set is a declaration and not a habit', () => {
    expect(answer<string[]>('hostChannels')).toEqual([
      'barColors',
      'bgColors',
      'boxes',
      'fills',
      'labels',
      'lines',
      'markers',
    ]);
  });
});

describe('LINES-04 — a row wider than the resource declared for it is refused', () => {
  it('refuses NOTHING against the widths derived from the same rows — the vacuity is the point', () => {
    // This is asserted rather than assumed. If the derivation ever stopped being a maximum, the
    // refusal would start firing on the generator's own output and this case would say so.
    expect(answer<readonly Refusal[]>('overOwnDerived')).toEqual([]);
    expect(answer<{ overPrice: number; ownPane: number }>('derivedWidths')).toEqual({
      overPrice: 5,
      ownPane: 3,
    });
  });

  it('refuses the row the width cannot hold, naming it and the two numbers', () => {
    // A width narrowed by one is exactly the defect the host shipped: five resolved Ichimoku lines
    // against one declared over-price slot, four readings filed and dropped, the panel saying three.
    const refusals = answer<readonly Refusal[]>('overNarrowed');

    expect(refusals).toHaveLength(1);
    expect(refusals[0].id).toBe('wide');
    expect(refusals[0].reason).toBe('wider than the resource declared for it');
    expect(refusals[0].detail).toBe('5 plots against a declared over-price width of 4');
  });

  it('judges each placement against ITS OWN width, never against the other', () => {
    // The two are one decision seen from either side of `overlay`, and they are different numbers:
    // 56 over the price and 14 in a lane. Judging a lane row by the over-price width would let a
    // lane study four lines wider than its lane through, and it draws as many as the lane holds.
    const refusals = answer<readonly Refusal[]>('perPlacement');

    expect(refusals.map((refusal) => refusal.id)).toEqual(['lane']);
    expect(refusals[0].detail).toBe('3 plots against a declared own-pane width of 2');
  });

  it('refuses a row that carries a channel nothing draws, and passes one that does not', () => {
    const refused = answer<readonly Refusal[]>('unknownChannel');

    expect(refused).toEqual([{ id: 'odd', reason: 'emits a channel nothing draws', detail: 'tables' }]);
    // CONTROL POSITIVE: the same shape with a channel the host DOES draw is not refused, so the
    // clause discriminates on the channel rather than on the member being present at all.
    expect(answer<readonly Refusal[]>('knownChannel')).toEqual([]);
  });
});

describe('the committed artefact is what the mechanism says it should be', () => {
  const manifest = JSON.parse(
    readFileSync(join(LIB_ROOT, 'example', 'indicators', 'manifest.json'), 'utf8'),
  ) as {
    readonly widths: { readonly overPrice: number; readonly ownPane: number };
    readonly indicators: ReadonlyArray<{
      readonly id: string;
      readonly placement: 'over-price' | 'own-pane';
      readonly plotIds: readonly string[];
      readonly channels?: Readonly<Record<string, number>>;
    }>;
  };

  it('declares a width that covers every row written under it, on both placements', () => {
    const widest = (placement: string): number =>
      manifest.indicators
        .filter((held) => held.placement === placement)
        .reduce((most, held) => Math.max(most, held.plotIds.length), 0);

    expect(manifest.widths.overPrice).toBe(widest('over-price'));
    expect(manifest.widths.ownPane).toBe(widest('own-pane'));
  });

  it('offers no row that emits a channel nothing draws', () => {
    const drawn = new Set(answer<string[]>('hostChannels'));
    const offending = manifest.indicators.flatMap((held) =>
      Object.keys(held.channels ?? {})
        .filter((channel) => !drawn.has(channel))
        .map((channel) => `${held.id}:${channel}`),
    );

    expect(offending).toEqual([]);
    // And the channels ARE recorded rather than the record being empty for a different reason:
    // measured on the committed file, 104 rows carry a fill and 20 carry background shading.
    const rowsWith = (channel: string): number =>
      manifest.indicators.filter((held) => held.channels?.[channel] !== undefined).length;
    expect(rowsWith('fills')).toBe(104);
    expect(rowsWith('bgColors')).toBe(20);
    expect(rowsWith('markers')).toBe(72);
  });
});

describe('PROOF-01 — a row the generator withdraws is declared, or the build is red', () => {
  it('refuses a withdrawal nothing signed, naming every id and the rule that took it', () => {
    // MEASURED BEFORE THIS RULE: the generator exempted any row it had refused itself from the
    // vanished-id refusal, and nothing else pinned the offered-row count. Three ordinary
    // indicators were withdrawn behind a planted rule and 307 rows were written with `npm test`
    // 1449/1449, `npm run e2e` 96/96 and `npm run proof` 33/33 — the only trace a stderr line
    // nothing asserts. A host's saved workspace loses `bop` exactly as hard either way.
    expect(answer<readonly Withdrawal[]>('undeclaredWithdrawal')).toEqual([
      { id: 'bop', measured: 'planted rule' },
      { id: 'mass-index', measured: 'planted rule' },
    ]);
  });

  it('CONTROL — the same two withdrawals, signed, are not a fault', () => {
    // Without this the rule could be "refuse every withdrawal", which is a build nobody can
    // tighten a rule in and would be satisfied by the assertion above on its own.
    expect(answer<readonly Withdrawal[]>('declaredWithdrawal')).toEqual([]);
  });

  it('signs them ONE AT A TIME — a ledger entry covers its own id and no other', () => {
    expect(answer<readonly Withdrawal[]>('halfDeclaredWithdrawal')).toEqual([
      { id: 'mass-index', measured: 'planted rule' },
    ]);
  });

  it('does not accept a blank reason, or a missing one, as a declaration', () => {
    // The ledger exists to carry a REASON. An entry that is only an id restates what the generator
    // already printed and signs nothing, which is the shape a silencing edit would take.
    expect(answer<readonly Withdrawal[]>('blankReasonWithdrawal').map((fault) => fault.id)).toEqual([
      'bop',
      'mass-index',
    ]);
  });

  it('leaves an id that VANISHED to the ledger that already owns it', () => {
    // An id gone from the library with no rule against it is a rename-or-removal question, and
    // `renames.json` and the defect ledger answer it. Two ledgers, two questions, no overlap.
    expect(answer<readonly Withdrawal[]>('vanishedIsNotWithdrawn')).toEqual([]);
  });

  it('prints the id, the rule and where to sign, so the message is the instruction', () => {
    const message = answer<string>('withdrawalMessage');

    expect(message).toContain('2 row(s)');
    expect(message).toContain('bop — planted rule');
    expect(message).toContain('mass-index — planted rule');
    expect(message).toContain('example/indicators/withdrawals.json');
  });
});
