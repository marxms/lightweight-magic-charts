/**
 * A stranded scope asks again — the repair path for `reset`.
 *
 * WHAT THIS FILE EXISTS TO PREVENT. `reset` is terminal: `applyAppend`, `applyOpen` and
 * `applyMember` refuse every frame and only count it. A scope reaches `reset` on every socket
 * reconnect, because the adapter mints a fresh generation and the machine rebases. Before this
 * repair path existed, `needsRefetch` announced that state and nothing in the package answered, so
 * a chart went blank on the first reconnect and stayed blank until the host changed symbol.
 *
 * The seam gate is the load-bearing assertion here. `rebase` leaves `seam: 'none'` and `baseline: 0`,
 * and `seedHistory` only proves the seam under `'anchored'` — so a repair fired on `reset` alone
 * would seed with the proof vacuously passed and report `verified`, which is the one outcome this
 * port exists to make impossible.
 *
 * See docs/explanation/port.md#a-stranded-scope-asks-again
 */

import { utcSeconds } from '../src/domain/types';
import type { Bar, Scope } from '../src/domain/types';
import type { Frame } from '../src/port/frames';
import {
  applyFrame,
  createScopeState,
  needsRefetch,
  restartScope,
  resumeScope,
} from '../src/port/scopeMachine';
import { openScope } from '../src/port/seedTransaction';
import type { FrameSink, HistoryRequest, HistoryResult, MarketDataPort } from '../src/port/ports';

const scope: Scope = {
  instrument: 'BTC/USDT',
  resolution: '4h',
  venue: 'binance',
  market: 'swap',
};

const bar = (time: number): Bar => ({
  time: utcSeconds(time),
  open: 1,
  high: 2,
  low: 0,
  close: 1.5,
  volume: 10,
});

const snapshotFrame = (gen: number, baseline: number, baselineTime: number | null): Frame => ({
  kind: 'snapshot',
  gen,
  seq: baseline,
  scope,
  state: new Map(),
  baseline,
  baselineTime: baselineTime ?? undefined,
});

const appendFrame = (gen: number, seq: number, time: number): Frame => ({
  kind: 'append',
  gen,
  seq,
  scope,
  bar: bar(time),
});

/** A port with no transport: the test emits frames and decides what each fetch answers. */
function createPortDouble(windows: Array<readonly Bar[]>) {
  let sink: FrameSink | null = null;
  const fetches: HistoryRequest[] = [];
  let queue = [...windows];

  const port: MarketDataPort = {
    describe: () => [{ shape: 'delta', scope, seriesIds: [] }],
    subscribe: (_scope, given) => {
      sink = given;
      return () => {
        sink = null;
      };
    },
    fetchBars: async (request: HistoryRequest): Promise<HistoryResult> => {
      fetches.push(request);
      const bars = queue.length > 1 ? (queue.shift() as readonly Bar[]) : (queue[0] ?? []);
      return { bars, exhausted: false };
    },
  };

  return {
    port,
    fetches,
    emit: (frame: Frame) => sink?.onFrame(frame),
    setWindows: (next: Array<readonly Bar[]>) => {
      queue = [...next];
    },
  };
}

const session = (double: ReturnType<typeof createPortDouble>, maxRefetch = 1) =>
  openScope({
    scope,
    shape: 'delta',
    port: double.port,
    history: { from: 0, to: Number.MAX_SAFE_INTEGER, barCount: 800 },
    maxRefetch,
  });

describe('resumeScope — the cursor survives the repair', () => {
  it('keeps the baseline, the anchor and the seam that restartScope throws away', () => {
    const seeded = applyFrame(
      createScopeState(scope, 'delta'),
      snapshotFrame(1, 42, 1_000),
    );

    const resumed = resumeScope(seeded);
    const restarted = restartScope(seeded);

    expect(resumed.baseline).toBe(42);
    expect(resumed.baselineTime).toBe(1_000);
    expect(resumed.seam).toBe('anchored');
    expect(resumed.phase).toBe('seeding');
    // The contrast IS the point: reseeding from `restartScope` would discard the cursor the
    // reconnect snapshot just established, which is the defect this port exists to close.
    expect(restarted.baseline).toBe(0);
    expect(restarted.baselineTime).toBeNull();
    expect(restarted.seam).toBe('none');
  });

  it('buffers rather than discards while the repair fetch is in flight', () => {
    const stranded = applyFrame(
      applyFrame(createScopeState(scope, 'delta'), snapshotFrame(1, 5, 500)),
      snapshotFrame(2, 6, 600),
    );
    expect(needsRefetch(stranded)).toBe(true);

    const held = applyFrame(resumeScope(stranded), appendFrame(2, 7, 700));

    expect(held.buffered).toHaveLength(1);
    expect(held.discarded).toBe(stranded.discarded);
  });
});

describe('reseed — a rebased scope comes back to life', () => {
  it('returns the scope to live over a window that reaches the anchor', async () => {
    const double = createPortDouble([[bar(900), bar(1_000)]]);
    const opened = session(double);
    double.emit(snapshotFrame(1, 42, 1_000));
    await opened.outcome;
    expect(opened.state().phase).toBe('live');

    // The reconnect: a new generation rebases the scope, then its snapshot re-establishes the cursor.
    double.emit(snapshotFrame(2, 50, 2_000));
    expect(needsRefetch(opened.state())).toBe(true);
    expect(opened.state().bars).toHaveLength(0);

    double.setWindows([[bar(1_900), bar(2_000)]]);
    const repaired = await opened.reseed();

    expect(repaired.kind).toBe('seeded');
    expect(opened.state().phase).toBe('live');
    expect(opened.state().bars).toHaveLength(2);
    // The window replaced the bars and the cursor stood.
    expect(opened.state().baseline).toBe(50);
  });

  it('refuses WITHOUT fetching while the cursor is not re-established', async () => {
    const double = createPortDouble([[bar(1_000)]]);
    const opened = session(double);
    double.emit(snapshotFrame(1, 42, 1_000));
    await opened.outcome;
    const before = double.fetches.length;

    // A generation whose first frame is an append leaves `seam: 'none'` and `baseline: 0`. Seeding
    // there would pass the anchor proof vacuously and report a verified seam.
    double.emit(appendFrame(2, 1, 1_100));
    expect(needsRefetch(opened.state())).toBe(true);
    expect(opened.state().seam).toBe('none');

    const refused = await opened.reseed();

    expect(refused.kind).toBe('aborted');
    expect(double.fetches).toHaveLength(before);
  });

  it('does nothing when the scope is not stranded', async () => {
    const double = createPortDouble([[bar(1_000)]]);
    const opened = session(double);
    double.emit(snapshotFrame(1, 42, 1_000));
    await opened.outcome;
    const before = double.fetches.length;

    await opened.reseed();

    expect(double.fetches).toHaveLength(before);
  });

  it('runs one repair at a time, so an older window cannot land after a newer one', async () => {
    const double = createPortDouble([[bar(900), bar(1_000)]]);
    const opened = session(double);
    double.emit(snapshotFrame(1, 42, 1_000));
    await opened.outcome;
    const before = double.fetches.length;

    double.emit(snapshotFrame(2, 50, 2_000));
    double.setWindows([[bar(1_900), bar(2_000)]]);
    const [first, second] = await Promise.all([opened.reseed(), opened.reseed()]);

    expect(double.fetches).toHaveLength(before + 1);
    expect(first).toEqual(second);
  });

  it('stops repairing once the ceiling is spent, instead of fetching per frame', async () => {
    const double = createPortDouble([[bar(10)]]);
    const opened = session(double, 0);
    double.emit(snapshotFrame(1, 42, 1_000));
    await opened.outcome;

    double.emit(snapshotFrame(2, 50, 2_000));
    // Every window misses the anchor, so every repair fails. The ceiling is what keeps a
    // permanently stale history endpoint from turning the repair into a fetch loop.
    const attempts = double.fetches.length;
    for (let i = 0; i < 12; i += 1) await opened.reseed();

    expect(double.fetches.length - attempts).toBeLessThanOrEqual(6);
  });
});

describe('the stale window announces itself', () => {
  it('lands in reset naming stale-history, so the scope is not stranded in seeding', async () => {
    const double = createPortDouble([[bar(10)]]);
    const opened = session(double, 0);
    double.emit(snapshotFrame(1, 42, 1_000));

    const spent = await opened.outcome;

    expect(spent.kind).toBe('stale-history');
    // Before this, the spent loop published `restartScope`, which lands in `seeding` — invisible to
    // `needsRefetch`, so frames piled up until the buffer cap fired a false gap.
    expect(opened.state().phase).toBe('reset');
    expect(opened.state().resetCause).toBe('stale-history');
    expect(needsRefetch(opened.state())).toBe(true);
  });
});
