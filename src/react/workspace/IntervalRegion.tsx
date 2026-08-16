/**
 * The interval control, wired to the thing it names.
 * See docs/explanation/react-workspace.md#why-a-region-and-not-a-row-of-chips
 */
import { memo } from 'react';
import type { ReactElement } from 'react';

import { TimeframeChips } from '../TimeframeChips';
import { useWorkspaceChrome } from '../chrome/ChromeContext';
import { useWorkspaceSetup, useWorkspaceSetupWriter } from './setupContext';

export interface IntervalRegionProps {
  readonly options: readonly string[];
  readonly onRequest?: (timeframe: string) => void;
}

export const IntervalRegion = memo(function IntervalRegion({
  options,
  onRequest,
}: IntervalRegionProps): ReactElement {
  const { theme, labels } = useWorkspaceChrome();
  const saved = useWorkspaceSetup((setup) => setup.timeframe);
  const write = useWorkspaceSetupWriter();

  return (
    <TimeframeChips
      options={options}
      // The SAME fallback the composition reads by. See docs/explanation/react-workspace.md#the-same-fallback
      active={saved ?? options[0] ?? ''}
      label={labels.interval}
      onChange={(timeframe) => {
        write({ timeframe });
        onRequest?.(timeframe);
      }}
      theme={theme}
    />
  );
});
