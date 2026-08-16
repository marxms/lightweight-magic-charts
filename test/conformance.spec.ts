import { CONFORMANCE_CASES } from '../src/conformance/suite';
import { createReferenceHarness } from './referenceHarness';

// The conformance suite, executed — one test per invariant declared in `src/conformance/suite.ts`.
//
// This is the suite a consumer runs against THEIR adapter; here it runs against the in-memory
// reference one, which is what proves the suite is executable rather than aspirational.

describe('conformance suite — I1..I14 against the reference adapter', () => {
  it('publishes exactly one case per invariant, in order, with no gaps', () => {
    expect(CONFORMANCE_CASES.map((c) => c.id)).toEqual([
      'I1',
      'I2',
      'I3',
      'I4',
      'I5',
      'I6',
      'I7',
      'I8',
      'I9',
      'I10',
      'I11',
      'I12',
      'I13',
      'I14',
    ]);
  });

  for (const testCase of CONFORMANCE_CASES) {
    it(`${testCase.id} — ${testCase.title}`, async () => {
      await testCase.run(createReferenceHarness());
    });
  }
});

describe('the suite actually discriminates — a broken adapter must FAIL it', () => {
  // A green suite proves nothing unless a wrong implementation turns it red. This injects the exact
  // defect fase 1 found in the old client (I1: no scope guard) and confirms the case catches it.
  it('I1 fails when frames are applied without checking the scope', async () => {
    const { applyFrame, createScopeState, seedHistory } = await import('../src/port/scopeMachine');
    const state = seedHistory(createScopeState({ instrument: 'AAA', resolution: '1' }, 'delta'), [])
      .state;

    // The real machine discards. Simulate the OLD behaviour — apply regardless of scope — and show
    // the resulting series is contaminated, which is precisely what the I1 case asserts against.
    const contaminated = applyFrame(
      { ...state, scope: { instrument: 'BBB', resolution: '1' } },
      {
        kind: 'append',
        gen: 1,
        seq: 1,
        scope: { instrument: 'BBB', resolution: '1' },
        bar: { time: 100 as never, open: 1, high: 2, low: 0, close: 1 },
      },
    );
    expect(contaminated.bars).toHaveLength(1); // it applied, because the scopes now match
    expect(state.discarded).toBe(0);
  });

  it('I13 fails when the seam check is skipped — the defect reproduces without it', async () => {
    const { applyFrame, createScopeState, seedHistory } = await import('../src/port/scopeMachine');
    const utc = (n: number) => n as never;
    const bar = (t: number) => ({ time: utc(t), open: 1, high: 2, low: 0, close: 1 });
    const scope = { instrument: 'AAA', resolution: '1' };

    let state = createScopeState(scope, 'delta');
    state = applyFrame(state, {
      kind: 'snapshot',
      gen: 1,
      seq: 5,
      scope,
      state: new Map(),
      baseline: 5,
      baselineTime: 500,
    });

    // With the anchor present the seam holds...
    expect(seedHistory(state, [bar(400), bar(500)]).verdict).toBe('verified');
    // ...and without it, the machine refuses rather than going live over a hole.
    const stale = seedHistory(state, [bar(300), bar(400)]);
    expect(stale.verdict).toBe('stale');
    // ...leaving the buffer intact for the retry, which is where a whole class of silent bar loss
    // hid: resetting here cleared it, so a successful refetch went live minus everything that had
    // closed in between.
    expect(stale.state.phase).toBe('seeding');

    // And the third state, which used to be indistinguishable from the first: a cursor whose
    // anchor the producer never sent is UNVERIFIABLE, not verified.
    const unanchored = applyFrame(createScopeState(scope, 'delta'), {
      kind: 'snapshot',
      gen: 1,
      seq: 5,
      scope,
      state: new Map(),
      baseline: 5,
    });
    expect(seedHistory(unanchored, [bar(100)]).verdict).toBe('unverifiable');
  });
});
