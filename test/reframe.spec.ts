/**
 * The framing decision, alone.
 *
 * WHY THIS FILE EXISTS. The defect it is written against was a RACE, and a race is exactly what an
 * end-to-end probe measures badly: the same test passed on a machine where history happened to
 * arrive first, and the user saw the failure every time on a machine where it did not. Pulling the
 * decision out of React makes both orders reachable in the same run.
 */
import { LIVE_BAR_GROWTH, shouldReframe } from '../src/react/surface/reframe';

const at = (over: Partial<Parameters<typeof shouldReframe>[0]>) =>
  shouldReframe({ datasetChanged: false, barCount: 800, framedAt: 800, autoFit: false, ...over });

describe('shouldReframe', () => {
  it('frames a dataset it has never framed', () => {
    expect(at({ framedAt: null })).toBe(true);
    expect(at({ datasetChanged: true })).toBe(true);
  });

  it('does NOT reframe a settled dataset', () => {
    expect(at({})).toBe(false);
  });

  it('reframes when the load has since doubled — THE DEFECT', () => {
    // Reported twice from live use: switching interval left the right half of the chart blank. The
    // framing ran against whatever had arrived at that instant — one bar — and then marked the
    // dataset as framed, so the full history that landed a moment later never got a view.
    expect(at({ framedAt: 1, barCount: 800 })).toBe(true);
    expect(at({ framedAt: 2, barCount: 4 })).toBe(true);
    expect(at({ framedAt: 400, barCount: 800 })).toBe(true);
  });

  it('reframes for a partial load that does NOT double — THE SECOND DEFECT', () => {
    // Reported with the fit-to-screen button TURNED OFF, which is what exposed it: with autoFit on
    // there is an earlier `return true` and the threshold never decides anything. History arriving
    // in two waves (500 then 800) never doubles, so a "doubled" rule leaves the view framed for the
    // first wave and the rest of the screen blank.
    expect(at({ framedAt: 500, barCount: 800 })).toBe(true);
    expect(at({ framedAt: 700, barCount: 800 })).toBe(true);
    expect(at({ framedAt: 799, barCount: 801 })).toBe(true);
  });

  it('reframes when the set SHRINKS — THE THIRD DEFECT', () => {
    // Measured on the deploy: after a timeframe change the chart showed 800 bars worth of range with
    // 3 bars in it — two lit columns out of 1144. The identity changes on the render, but `bars` is
    // still the PREVIOUS interval's, so the framing is made for 800; then the new interval starts
    // loading at 3 and a grow-only rule never fires again.
    expect(at({ framedAt: 800, barCount: 3 })).toBe(true);
    expect(at({ framedAt: 800, barCount: 799 })).toBe(true);
  });

  it('does NOT reframe for the live bar arriving', () => {
    // The other half of the rule. Reframing on every tick would yank the view out from under a user
    // who had scrolled somewhere on purpose — and that user is precisely the one who turned the
    // fit-to-screen button off.
    //
    // The `1599` case that used to live here asserted the opposite and was WRONG: it was written to
    // describe the doubling threshold rather than the property, and 800 -> 1599 is a load arriving,
    // not a bar closing. A test that restates the implementation defends the implementation, not
    // the user.
    expect(at({ framedAt: 800, barCount: 801 })).toBe(false);
    expect(at({ framedAt: 12, barCount: 13 })).toBe(false);
  });

  it('honours autoFit, which is the host asking to always follow', () => {
    expect(at({ autoFit: true })).toBe(true);
  });

  it('has nothing to frame with no bars', () => {
    expect(at({ barCount: 0, framedAt: null, datasetChanged: true })).toBe(false);
  });

  it('states what a live bar costs rather than hiding it in a comparison', () => {
    expect(LIVE_BAR_GROWTH).toBe(1);
  });
});
