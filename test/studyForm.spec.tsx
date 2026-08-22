/**
 * @jest-environment jsdom
 *
 * The HOST's parameter form, mounted the way a host mounts it.
 *
 * `example/studyForm.tsx` is the answer to the one thing this package refuses to do: 320 studies
 * with 1021 controls is not an enumerable vocabulary, and `chrome.labels` is a closed record of
 * groups, so the naming and the drawing of the form belong to whoever adopts the library. That makes
 * the form host code — and host code with a contract, because the caret, the labels and the refusal
 * of an out-of-range value are what a user actually meets.
 *
 * MOUNTED THROUGH `<ChartWorkspace>`, NEVER THROUGH A PROBE OF THE HOOK. What has to hold is that a
 * `WorkspaceSection.Body` reaching for the published read and write doors, inside a real workspace
 * with a real store, renders reachable controls and writes what it should. A probe would assert that
 * a function was called; only a mount crosses the setup store, the tab reducer and the persisted
 * store, which is where a value gets dropped.
 *
 * NO VENDOR LIBRARY IS LOADED HERE, deliberately. The form draws from manifest ROWS, which are
 * data; `example/indicators.ts` — and the 182 KB of committed catalogue behind it — is what the
 * proof job exercises, in its own CI job, for the reason `jest.config.js` already gives about
 * keeping this suite browser-free and quick.
 */
import type { ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { STUDY_PARAM_SECTIONS, publishStudyRows } from '../example/studyForm';
import type { ManifestRow } from '../example/studyValues';
import { ChartWorkspace } from '../src/react/workspace/ChartWorkspace';
import type { ChartWorkspaceProps } from '../src/react/workspace/ChartWorkspace';
import { resolutionPolicy } from '../src/catalogue/sources';
import type { SourceLookup } from '../src/catalogue/sources';
import { resolveSources } from '../src/indicator/resolution';
import type { Bar, Scope } from '../src/domain/types';
import { seriesId, utcSeconds } from '../src/domain/types';
import type { ChartEngine, SeriesHandle, WorkspaceChartHandle } from '../src/port/chartApi';
import type { FrameSink, HistoryResult, MarketDataPort, Unsubscribe } from '../src/port/ports';
import type { StudySettings, WorkspaceSetupPolicy } from '../src/tabs/setup';
import type { WorkspaceStore } from '../src/tabs/workspaceTabs';

/* ---- the smallest workspace that still mounts ------------------------------------------------ */

const BARS: readonly Bar[] = [
  { time: utcSeconds(1000), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  { time: utcSeconds(2000), open: 1.5, high: 3, low: 1, close: 2.5, volume: 20 },
];

const STUDY_ID = 'harness-study';
const QUIET_ID = 'quiet-study';

const CATALOGUE: WorkspaceSetupPolicy = {
  catalogue: [{ id: 'price', defaultVisible: true, heightPx: 200, title: 'Price' }],
  servedTimeframes: ['1h'],
  gridFallback: ['1h'],
  maxGridCells: 2,
  density: { floor: 0.1, gamma: 1 },
  showDensity: false,
  showProfile: false,
  autoFit: true,
  coerceIndicators: (raw) =>
    Array.isArray(raw)
      ? raw.filter((id): id is string => id === STUDY_ID || id === QUIET_ID)
      : [],
};

const fakePort = (): MarketDataPort => ({
  describe: () => [],
  subscribe: (_scope: Scope, _sink: FrameSink): Unsubscribe => () => undefined,
  fetchBars: async (): Promise<HistoryResult> => ({ bars: BARS, exhausted: true }),
});

const fakePane = (index: number) => ({
  setStretchFactor: () => undefined,
  getStretchFactor: () => 1,
  getHTMLElement: () => null,
  setPreserveEmptyPane: () => undefined,
  moveTo: () => undefined,
  paneIndex: () => index,
});

const fakeEngine: ChartEngine = () => {
  let paneCount = 1;
  return {
    panes: () => Array.from({ length: paneCount }, (_unused, index) => fakePane(index)),
    addPane: () => {
      paneCount += 1;
      return fakePane(paneCount - 1);
    },
    addSeries: (): SeriesHandle =>
      ({
        setData: () => undefined,
        applyOptions: () => undefined,
        priceScale: () => ({ applyOptions: () => undefined }),
        createPriceLine: () => ({ applyOptions: () => undefined }),
        removePriceLine: () => undefined,
        priceToCoordinate: () => null,
        coordinateToPrice: () => null,
        attachPrimitive: () => undefined,
        detachPrimitive: () => undefined,
        setMarkers: () => undefined,
      }) as unknown as SeriesHandle,
    applyOptions: () => undefined,
    timeScale: () => ({ fitContent: () => undefined }),
    subscribeCrosshairMove: () => undefined,
    unsubscribeCrosshairMove: () => undefined,
    remove: () => undefined,
  } as unknown as WorkspaceChartHandle;
};

const LOOKUP: SourceLookup = (id) =>
  id !== STUDY_ID
    ? undefined
    : {
        id,
        label: 'Harness study',
        placement: 'own-pane',
        series: () => [
          {
            spec: { id: seriesId('harness-plot'), label: 'Harness study', shape: 'line', color: '#fff' },
            provider: {
              id: seriesId('harness-plot'),
              compute: (bars: readonly Bar[]) => bars.map((bar) => ({ time: bar.time, value: bar.close })),
            },
          },
        ],
      };

interface ResolveCall {
  readonly settings: Readonly<Record<string, StudySettings>> | undefined;
}

const studies = (calls: ResolveCall[]): NonNullable<ChartWorkspaceProps['studies']> => ({
  catalogue: [
    { provider: { id: seriesId('harness-provider'), compute: () => [] }, id: STUDY_ID, label: 'Harness study', category: 'Trend' },
  ],
  capacity: 2,
  lanes: { plots: 2, colors: ['#f5a623', '#4c9aff'], heightPx: 90 },
  resolve: (ids, bars, settings) => {
    calls.push({ settings });
    return resolveSources(ids, LOOKUP, bars, resolutionPolicy({ lanes: 2 }));
  },
});

function memoryStore(seeded: string | null = null): { store: WorkspaceStore; written: string[] } {
  const written: string[] = [];
  let payload = seeded;
  return {
    store: {
      read: () => payload,
      write: (next) => {
        payload = next;
        written.push(next);
      },
    },
    written,
  };
}

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

/**
 * The row shape the generated manifest carries, hand-written here — one control of each declared
 * type, with the bounds that make the refusal clauses mean something.
 */
const ROW: ManifestRow = {
  id: STUDY_ID,
  fallbackLabel: 'Harness study',
  fallbackShortLabel: 'HS',
  category: 'Trend',
  placement: 'own-pane',
  plotIds: ['plot0'],
  plotTitles: ['Harness'],
  inputs: [
    { id: 'len', type: 'int', defval: 14, fallbackTitle: 'Length', min: 1, max: 500 },
    { id: 'mult', type: 'float', defval: 2, fallbackTitle: 'Multiplier', min: 0.001, step: 0.1 },
    { id: 'src', type: 'enum', defval: 'close', fallbackTitle: 'Source', options: ['open', 'close'] },
    { id: 'divergence', type: 'bool', defval: false, fallbackTitle: 'Calculate divergence' },
  ],
};

const NO_INPUTS: ManifestRow = { ...ROW, id: QUIET_ID, fallbackLabel: 'Quiet study', inputs: [] };

const mountWorkspace = (calls: ResolveCall[], seeded: string | null = null): { written: string[] } => {
  const held = memoryStore(seeded);
  render(
    <ChartWorkspace
      catalogue={CATALOGUE}
      data={{ port: fakePort(), engine: fakeEngine, symbol: 'AAA-BBB' }}
      layout={{ heightPx: 420 }}
      studies={studies(calls)}
      chrome={{ sections: STUDY_PARAM_SECTIONS }}
      tabs={{ store: held.store }}
    />,
  );
  return held;
};

const openParams = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Studies' }));
  fireEvent.click(screen.getByTestId('workspace-catalogue-section-params'));
};

const pickStudy = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Studies' }));
  fireEvent.click(screen.getByTestId('workspace-catalogue-category-Trend'));
  fireEvent.click(screen.getByTestId('workspace-catalogue-entry-harness-provider'));
};

const seededWith = (settings: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({
    version: 1,
    active: 0,
    tabs: [
      { id: 'tab-1', name: 'Tab', setup: { indicators: [STUDY_ID, QUIET_ID], studySettings: settings } },
    ],
  });

beforeEach(() => {
  publishStudyRows([ROW, NO_INPUTS]);
});

/* ---- the clauses ---------------------------------------------------------------------------- */

describe('the host draws the form the library refuses to name', () => {
  it('gives every control a label, its bounds in words, and the right role', async () => {
    mountWorkspace([], seededWith({}));
    await settle();
    openParams();

    // ONE FIELDSET PER STUDY, named by its legend — the element `SeriesMenuRegion` itself reaches
    // for, so the grouping is announced rather than merely drawn.
    const group = screen.getByRole('group', { name: 'Harness study' });
    expect(group).toBeInTheDocument();

    // A NUMBER FIELD IS REACHED BY ITS LABEL, not by a test id: `getByLabelText` fails unless the
    // `label`/`htmlFor` pair actually associates, which is the whole obligation.
    const length = screen.getByLabelText('Length');
    expect(length).toHaveAttribute('type', 'number');
    expect(length).toHaveAttribute('min', '1');
    expect(length).toHaveAttribute('max', '500');
    expect(length).toHaveValue(14);

    // A SPINNER DOES NOT ANNOUNCE ITS LIMITS, so a describing node says them and the field points
    // at it. The reader follows `aria-describedby` to a node that exists and holds the range.
    const describedBy = length.getAttribute('aria-describedby');
    expect(describedBy).toBe('param-harness-study-len-bounds');
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      'A whole number from 1 to 500.',
    );

    // The other two roles, each the one this repository's own chrome already chose.
    const divergence = screen.getByRole('switch', { name: 'Calculate divergence' });
    expect(divergence).toHaveAttribute('aria-checked', 'false');
    const source = screen.getByLabelText('Source');
    expect(source.tagName).toBe('SELECT');
    // The OPTIONS ARE TOKENS. A translated caption could never round-trip into the payload.
    expect(Array.from(source.querySelectorAll('option')).map((o) => o.getAttribute('value'))).toEqual([
      'open',
      'close',
    ]);

    // A study that takes no inputs says so, and gets no reset button.
    expect(screen.getByRole('group', { name: 'Quiet study' })).toHaveTextContent(
      'This study takes no inputs.',
    );
    expect(screen.queryByTestId(`param-${QUIET_ID}-reset`)).not.toBeInTheDocument();
  });

  it('refuses an out-of-range value instead of clamping it, and writes nothing', async () => {
    const calls: ResolveCall[] = [];
    const held = mountWorkspace(calls, seededWith({}));
    await settle();
    openParams();

    const length = screen.getByLabelText('Length');
    fireEvent.change(length, { target: { value: '900' } });
    await settle();

    // NOT REWRITTEN TO 500. The field still shows what was typed, says it is invalid, and the
    // describing node switches to the sentence naming the range.
    expect(length).toHaveValue(900);
    expect(length).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('param-harness-study-len-bounds')).toHaveTextContent(
      '900 is outside what this control accepts, so nothing was saved.',
    );
    expect(held.written).toEqual([]);

    // AND THE DRAFT LETS A USER TYPE THROUGH AN INVALID PREFIX: `9` -> `90` are both legal, so
    // both are written, and the clamping version would have written 500 three times over.
    fireEvent.change(length, { target: { value: '90' } });
    await settle();
    expect(length).toHaveAttribute('aria-invalid', 'false');
    const last = JSON.parse(held.written[held.written.length - 1]) as {
      tabs: readonly { setup: { studySettings?: Record<string, unknown> } }[];
    };
    expect(last.tabs[0].setup.studySettings).toEqual({ [STUDY_ID]: { len: 90 } });
  });

  it('writes each control through the published door and reaches resolve with it', async () => {
    const calls: ResolveCall[] = [];
    mountWorkspace(calls);
    await settle();
    pickStudy();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await settle();
    const beforeEdit = calls.length;

    fireEvent.click(screen.getByTestId('workspace-catalogue-section-params'));
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'open' } });
    await settle();
    fireEvent.click(screen.getByRole('switch', { name: 'Calculate divergence' }));
    await settle();

    expect(calls.length).toBeGreaterThan(beforeEdit);
    expect(calls[calls.length - 1].settings).toEqual({ [STUDY_ID]: { src: 'open', divergence: true } });
    // The study did not leave the list: a redraw, never a remount.
    expect(screen.getByTestId(`workspace-active-${STUDY_ID}`)).toBeInTheDocument();
  });

  it('surrenders a half-typed draft to an outside write, and resets to no values at all', async () => {
    const calls: ResolveCall[] = [];
    mountWorkspace(calls, seededWith({ [STUDY_ID]: { len: 30 } }));
    await settle();
    openParams();

    const length = screen.getByLabelText('Length');
    expect(length).toHaveValue(30);

    // Half-typed and refused: nothing committed, so the draft is still the user's.
    fireEvent.change(length, { target: { value: '' } });
    await settle();
    expect(length).toHaveValue(null);

    // RESET IS AN OUTSIDE WRITE. Storing today's defaults would freeze them into a payload the
    // next vendor release contradicts, so it writes NO values — and the field re-reads the
    // vendor's default from the row rather than keeping the abandoned draft.
    fireEvent.click(screen.getByTestId(`param-${STUDY_ID}-reset`));
    await settle();
    expect(screen.getByLabelText('Length')).toHaveValue(14);
    expect(calls[calls.length - 1].settings).toEqual({ [STUDY_ID]: {} });
  });

  it('loads a study whose stored value the host refuses, with no values rather than no study', async () => {
    const calls: ResolveCall[] = [];
    mountWorkspace(calls, seededWith({ [STUDY_ID]: { len: 0, mult: 1.5 } }));
    await settle();
    openParams();

    // `len: 0` is below the declared minimum and is dropped; the neighbouring value survives, and
    // the study itself is still in the list and still drawn.
    expect(screen.getByLabelText('Length')).toHaveValue(14);
    expect(screen.getByLabelText('Multiplier')).toHaveValue(1.5);
    expect(screen.getByTestId(`workspace-active-${STUDY_ID}`)).toBeInTheDocument();
    expect(calls[calls.length - 1].settings).toEqual({ [STUDY_ID]: { len: 0, mult: 1.5 } });
  });
});
