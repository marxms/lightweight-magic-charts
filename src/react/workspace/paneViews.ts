/**
 * What the surface is asked to draw: the tab's panes, and the lanes the studies occupy.
 * See docs/explanation/react-workspace.md#the-two-halves-are-not-the-same-kind-of-pane
 */

import { laneDraft } from '../../catalogue/lanes';
import { bindPane } from '../../catalogue/draft';
import { relabelled } from '../../catalogue/relabel';
import type { PaneSpec, SeriesId, ValueFormat } from '../../domain/types';
import type { ResolvedSourceView } from '../../indicator/resolution';
import { DEFAULT_CATALOGUE_HEIGHT_PX } from '../../pane/budget';
import type { PaneConfig } from '../../pane/budget';
import { PRICE_PANE_ID } from '../../layout/computeLayout';
import type { PaneView } from '../surface/ChartSurface';

/** The lane calibration, the consumer's. See docs/explanation/react-workspace.md#no-default-palette */
export interface WorkspaceLanes {
  readonly plots: number;
  readonly colors: readonly string[];
  readonly heightPx?: number;
}

export interface PaneViewInput {
  /** Every pane this build offers, drawn or not. The price pane is among them and is never listed. */
  readonly specs: readonly PaneSpec[];
  readonly panes: readonly PaneConfig[];
  readonly studies: readonly ResolvedSourceView[];
  readonly lanes?: WorkspaceLanes;
  /** Series identity -> the plot's title, so the legend names the STUDY and not the lane. */
  readonly labels?: ReadonlyMap<SeriesId, string>;
  /** How many lanes exist. It is the study limit seen from the other side. */
  readonly capacity: number;
  readonly laneTitle: string;
}

const NO_LABELS: ReadonlyMap<SeriesId, string> = new Map();
/** A lane plots a signed reading against its own axis, so two decimals and no unit. */
const LANE_FORMAT: ValueFormat = { kind: 'ratio', decimals: 2 };

/** WITHOUT THE PRICE PANE. See docs/explanation/react-workspace.md#without-the-price-pane */
function authoredViews(input: PaneViewInput): readonly PaneView[] {
  const byId = new Map(input.specs.map((spec) => [String(spec.id), spec]));
  return input.panes.flatMap((pane, at) => {
    const spec = pane.id === PRICE_PANE_ID ? undefined : byId.get(pane.id);
    return spec === undefined ? [] : [{ spec, visible: pane.visible, heightPx: pane.heightPx, lastUsedAt: at }];
  });
}

/** One lane per slot, wearing the name of whatever study is in it, visible only while it is. */
function laneViews(input: PaneViewInput, from: number): readonly PaneView[] {
  const lanes = input.lanes;
  if (lanes === undefined) return [];
  const heightPx = lanes.heightPx ?? DEFAULT_CATALOGUE_HEIGHT_PX;
  // An overlay study draws over the candles, so it lights no lane at all.
  const occupant = new Map(
    input.studies.filter((view) => !view.overlay).map((view) => [view.lane, view]),
  );
  return Array.from({ length: input.capacity }, (_unused, lane) => {
    const held = occupant.get(lane);
    const bound = bindPane(
      laneDraft<string>({
        lane,
        title: input.laneTitle,
        format: LANE_FORMAT,
        plots: lanes.plots,
        colors: lanes.colors,
        targetHeightPx: heightPx,
        bind: (field) => field,
      }),
    );
    const named = relabelled(
      { spec: bound.spec, series: bound.series.map((s) => ({ spec: s.spec, source: { field: String(s.spec.id) } })) },
      input.labels ?? NO_LABELS,
      held?.label ?? null,
      held?.guide,
    );
    return {
      spec: named.spec,
      visible: held !== undefined,
      heightPx,
      // AFTER every authored pane. See docs/explanation/react-workspace.md#lanes-sort-after-the-authored-panes
      lastUsedAt: from + lane,
    };
  });
}

export function workspacePaneViews(input: PaneViewInput): readonly PaneView[] {
  const authored = authoredViews(input);
  return [...authored, ...laneViews(input, authored.length)];
}
