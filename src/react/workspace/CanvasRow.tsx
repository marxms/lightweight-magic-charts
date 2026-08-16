/**
 * The rail, the chart and the grid, all sized against ONE measured residual.
 * See docs/explanation/react-workspace.md#one-measured-residual
 */
import { memo, useEffect, useRef } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

import type { StackApplication } from '../../layout/application';
import { useWorkspaceChrome } from '../chrome/ChromeContext';
import { useResidualSurfaceHeight } from './useResidualSurfaceHeight';

const MIN_SURFACE_PX = 160;
/** The first frame's guess, and only it: from the first real measurement it is never read again. */
const FIRST_GUESS_CHROME_PX = 74;

const ROW: CSSProperties = { display: 'flex', alignItems: 'flex-start', flex: 1, minHeight: 0 };

export interface CanvasRowProps {
  readonly heightPx: number;
  readonly onLayout?: (application: StackApplication) => void;
  readonly children: (surfacePx: number) => ReactNode;
}

export const CanvasRow = memo(function CanvasRow({ heightPx, onLayout, children }: CanvasRowProps): ReactElement {
  const { testIdPrefix } = useWorkspaceChrome();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const measured = useResidualSurfaceHeight(boxRef);
  const residual = measured ?? heightPx - FIRST_GUESS_CHROME_PX;
  const degenerate = residual <= 0;

  // By reference. See docs/explanation/react-workspace.md#the-layout-report-is-held-by-reference
  const report = useRef(onLayout);
  report.current = onLayout;
  useEffect(() => {
    if (degenerate) report.current?.({ kind: 'degenerate', totalPx: residual });
  }, [degenerate, residual]);

  return (
    <div ref={boxRef} data-testid={`${testIdPrefix}-canvas-row`} style={ROW}>
      {degenerate ? null : children(Math.max(MIN_SURFACE_PX, residual))}
    </div>
  );
});
