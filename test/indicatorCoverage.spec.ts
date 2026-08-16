/**
 * `buildWorkspaceReport` / `formatWorkspaceReport` — what the load actually delivered, per pane.
 *
 * The five buckets below are the SAME INPUTS the host's component suite feeds today, and the
 * expected values are the host's: equality of output across the move is asserted, not presumed.
 */
import {
  buildWorkspaceReport,
  formatWorkspaceReport,
  type ReportedPane,
  type WorkspaceReport,
} from '../src/indicator/coverage';
import type { ReadingSeries, WorkspaceRow } from '../src/indicator/rows';

const T0 = 1_700_000_000_000;

/** Five buckets. Funding settles ONCE, at bucket 2; open interest prints on two of them. */
const ROWS = [
  { timestamp: T0, fundingRate: null, openInterestBase: null, cvd: 10 },
  { timestamp: T0 + 1, fundingRate: null, openInterestBase: 5, cvd: 12 },
  { timestamp: T0 + 2, fundingRate: 0.0001, openInterestBase: null, cvd: 14 },
  { timestamp: T0 + 3, fundingRate: null, openInterestBase: 6, cvd: 16 },
  { timestamp: T0 + 4, fundingRate: null, openInterestBase: null, cvd: 18 },
] as unknown as WorkspaceRow[];

const paneDrawing = (...fields: readonly [string, string][]): ReportedPane => ({
  series: fields.map(([field, label]) => ({ spec: { label }, source: { field } })),
});

const FUNDING = paneDrawing(['fundingRate', 'Funding (vigente)']);
const CVD = paneDrawing(['cvd', 'CVD']);

const readingsWith = (
  entries: readonly { name: string; values: number[] }[],
): ReadingSeries => ({ data: [{ indicators: entries }] });

describe('coverage', () => {
  it('counts what the FUNDING pane can show, not how often the exchange printed', () => {
    const report = buildWorkspaceReport(ROWS, null, [FUNDING], 12);

    // The rate settled at bucket 2 and is still in force at 3 and 4: three buckets the pane draws.
    expect(report.funding).toBe(3);
    // Control positive: the settlement count is reported SEPARATELY and is not the coverage. An
    // implementation counting prints would answer 1 to both and pass a laxer assertion.
    expect(report.settlements).toBe(1);
  });

  it('counts open interest print by print, because it is a measurement and not a rate in force', () => {
    const report = buildWorkspaceReport(ROWS, null, [FUNDING], null);

    expect(report.openInterest).toBe(2);
    // Control positive: carrying the last reading forward — correct for funding — answers 4 here,
    // and would be the chart claiming a position size nobody published.
    expect(report.openInterest).not.toBe(4);
  });

  it('reports the window it measured against, and the load time it was given', () => {
    const report: WorkspaceReport = buildWorkspaceReport(ROWS, null, [], 12);

    expect(report.candles).toBe(5);
    expect(report.loadMs).toBe(12);
  });
});

describe('what is missing', () => {
  it('names the series that arrived with no reading at all', () => {
    const report = buildWorkspaceReport(ROWS, null, [FUNDING, CVD], 12);

    // Every row has a cvd, so CVD is drawable and is not named.
    expect(report.missing).not.toContain('CVD');
    // Control positive: a pane with readings on SOME rows is not missing. Funding prints once in
    // five and is still a pane the trader can read — flagging it would cry wolf on every window.
    expect(report.missing).not.toContain('Funding (vigente)');

    const blind = buildWorkspaceReport(
      ROWS.map((row) => ({ ...row, fundingRate: null })) as WorkspaceRow[],
      null,
      [FUNDING],
      12,
    );
    expect(blind.missing).toEqual(['Funding (vigente)']);
  });

  it('speaks only for the panes THIS instance draws', () => {
    expect(buildWorkspaceReport(ROWS, null, [], 12).missing).toEqual([]);
    expect(buildWorkspaceReport(ROWS, null, [CVD], 12).missing).toEqual([]);
  });
});

describe('the indicator count', () => {
  it('counts distinct names that actually carried values', () => {
    const report = buildWorkspaceReport(
      ROWS,
      readingsWith([
        { name: 'rsi', values: [1, 2] },
        { name: 'cvd', values: [3, 4] },
        // Control positive: an entry the API answered with no values is not an indicator the chart
        // received. Counting `indicators.length` would report three.
        { name: 'moneyFlow', values: [] },
      ]),
      [],
      12,
    );

    expect(report.indicators).toBe(2);
  });
});

describe('the rendered line', () => {
  it('states each share against the window', () => {
    const line = formatWorkspaceReport(buildWorkspaceReport(ROWS, null, [], 12));

    expect(line).toContain('cobertura OI 40%');
    expect(line).toContain('funding 60% (1 settlements)');
  });

  it('says there is no denominator rather than printing zero percent', () => {
    // Control positive: no bars is not 0% — printing 0% reads as "the exchange published nothing"
    // instead of "nothing was loaded".
    expect(formatWorkspaceReport(buildWorkspaceReport([], null, [], 12))).toContain(
      'cobertura OI —',
    );
  });

  it('omits the parts it has no answer for rather than printing a placeholder', () => {
    const pending = formatWorkspaceReport(buildWorkspaceReport(ROWS, null, [], null));

    expect(pending).not.toContain('carga');
    expect(pending).not.toContain('SEM DADO');
    // Control positive: both appear the moment there is something to say.
    const loaded = formatWorkspaceReport(
      buildWorkspaceReport(
        ROWS.map((row) => ({ ...row, fundingRate: null })) as WorkspaceRow[],
        null,
        [FUNDING],
        12.4,
      ),
    );
    expect(loaded).toContain('carga 12 ms');
    // non-english-fixture: product text as it ships, which the app asserts word for word
    expect(loaded).toContain('SEM DADO: Funding (vigente)');
    expect(loaded).toContain('5 velas');
  });
});
