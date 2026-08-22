/**
 * The column of compact cells that stands beside the focus chart in grid mode.
 * See docs/explanation/react-workspace.md#a-cell-is-its-position
 */
import { memo } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import type { PriceScaleConvention, Scope, ValueFormat } from '../../domain/types';
import type { ChartEngine } from '../../port/chartApi';
import type { HistoryPort, LivePort } from '../../port/ports';
import { CompactCell } from '../CompactCell';
import { useWorkspaceChrome } from '../chrome/ChromeContext';
import { STACK } from '../theme';
import { useWorkspaceSetup, useWorkspaceSetupWriter } from './setupContext';

/** Which market the cells draw, and what they draw it with. All of it the host's. */
export interface CompactGridSource {
  readonly engine: ChartEngine;
  /** The SAME port the main canvas drinks from; a cell only asks for a shorter window. */
  readonly port: HistoryPort & LivePort;
  /** The market, minus the resolution: each cell carries its own. */
  readonly scope: Omit<Scope, 'resolution'>;
  readonly convention: PriceScaleConvention;
  readonly format?: ValueFormat;
  readonly barCount?: number;
}

export interface CompactGridProps {
  readonly source: CompactGridSource;
  /** Resolutions a cell may switch to on its own. */
  readonly timeframes: readonly string[];
  /** The measured residual, so the column ends where the canvas beside it ends. */
  readonly heightPx: number;
}

/** `width`, never `flex`: a basis of zero shrinks by zero and this column kept 0 px.
 * See docs/explanation/react-workspace.md#the-elastic-columns-ask-for-the-row-the-same-way */
const COLUMN: CSSProperties = {
  ...STACK,
  width: '100%',
  minWidth: 0,
};

export const CompactGrid = memo(function CompactGrid({
  source,
  timeframes,
  heightPx,
}: CompactGridProps): ReactElement | null {
  const { labels, testIdPrefix } = useWorkspaceChrome();
  const mode = useWorkspaceSetup((setup) => setup.layoutMode);
  const cells = useWorkspaceSetup((setup) => setup.gridCells);
  const write = useWorkspaceSetupWriter();
  const { engine, port, scope, convention, format, barCount } = source;

  if (mode !== 'grade' || scope.instrument === '') return null;

  const swap = (index: number, timeframe: string): void =>
    write({ gridCells: cells.map((held, at) => (at === index ? timeframe : held)) });
  const drop = (index: number): void =>
    write({ gridCells: cells.filter((_held, at) => at !== index) });

  return (
    <div data-testid={`${testIdPrefix}-grid`} style={{ ...COLUMN, height: heightPx }}>
      {cells.map((timeframe, index) => (
        <CompactCell
          // The cell IS the position: moving does not exist, only swapping its resolution.
          // biome-ignore lint/suspicious/noArrayIndexKey: index is the cell identity
          key={index}
          engine={engine}
          port={port}
          scope={{ ...scope, resolution: timeframe }}
          title={scope.instrument}
          timeframes={timeframes}
          onTimeframe={(next) => swap(index, next)}
          onRemove={cells.length > 1 ? () => drop(index) : undefined}
          convention={convention}
          format={format}
          barCount={barCount}
          labels={labels.compactCell}
          testIdPrefix={`${testIdPrefix}-cell-${index}`}
        />
      ))}
    </div>
  );
});
