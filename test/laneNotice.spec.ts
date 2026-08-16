/**
 * The lane notice, against the vocabulary it is actually handed.
 *
 * WHY THIS FILE EXISTS. The notice compared a `SeamState` — `none | anchored | unanchored` — against
 * `'verified'`, which belongs to `SeedVerdict` and which the variable can therefore never hold. The
 * comparison type-checked because the parameter was widened to `string`, and the result was a banner
 * shown on EVERY chart that had bars. Reported twice from live use as an unexplained warning.
 */
import { laneNotice } from '../src/react/chrome/labels';
import type { WorkspaceNoticeLabels } from '../src/react/chrome/labels';

const NOTICES: WorkspaceNoticeLabels = {
  noBars: (symbol: string) => `no bars ${symbol}`,
  unverifiedSeam: (symbol: string) => `unverified ${symbol}`,
  degenerate: (px: number) => `degenerate ${px}`,
  studyLimit: (capacity: number) => `study limit ${capacity}`,
  tabLimit: (capacity: number) => `tab limit ${capacity}`,
  unreadableTabs: 'unreadable tabs',
};

describe('laneNotice', () => {
  it('says nothing when the seam was proven', () => {
    expect(laneNotice(NOTICES, 800, 'seeded', 'BTC/USDT')).toBeNull();
  });

  it('warns ONLY when the producer sent a cursor with no anchor', () => {
    expect(laneNotice(NOTICES, 800, 'seeded-unverified', 'BTC/USDT')).toBe('unverified BTC/USDT');
  });

  it('reports absence of bars ahead of anything about the seam', () => {
    expect(laneNotice(NOTICES, 0, 'seeded-unverified', 'BTC/USDT')).toBe('no bars BTC/USDT');
  });

  it.each(['none', 'anchored', 'unanchored', 'aborted', null])(
    'stays quiet for %s, which is not a claim that the seam failed',
    (outcome) => {
      // The old code warned for every one of these. `anchored` is the most telling: it means the
      // anchor WAS there, and it still produced the banner.
      expect(laneNotice(NOTICES, 800, outcome, 'BTC/USDT')).toBeNull();
    },
  );
});
