/**
 * The footer: the canvas said out loud, from signals OTHER owners already computed.
 * See docs/explanation/react-workspace.md#the-footer-is-a-sink
 */
import { memo } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import { useWorkspaceChrome } from '../chrome/ChromeContext';

/** What other owners decided, ready to be read. Every field is reported, never derived. */
export interface StatusReading {
  /** `1` = at target. Below it, the panes were shrunk to fit, and the ratio is whoever shrank them. */
  readonly paneScale?: number;
  readonly evicted?: readonly string[];
  readonly firedAlerts?: readonly string[];
  /** The coverage report, ALREADY formatted — it is a sentence, not a structure to render. */
  readonly report?: string;
}

export interface StatusFooterProps {
  /** The `id` the canvas points at with `aria-describedby`. */
  readonly id: string;
  readonly state: string;
  readonly loading?: boolean;
  readonly reading?: StatusReading;
}

const ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 16,
  padding: '0 4px',
  opacity: 0.75,
  fontSize: 11,
};

const NO_READING: StatusReading = {};

export const StatusFooter = memo(function StatusFooter({
  id,
  state,
  loading = false,
  reading = NO_READING,
}: StatusFooterProps): ReactElement {
  const { theme, labels, testIdPrefix } = useWorkspaceChrome();
  const text = labels.status;
  const { paneScale, evicted = [], firedAlerts = [], report } = reading;

  return (
    <div data-testid={`${testIdPrefix}-footer`} style={{ ...ROW, color: theme.text }}>
      {/* See docs/explanation/react-workspace.md#one-live-region-and-no-per-tick-reading */}
      <span id={id} role="status" data-testid={`${testIdPrefix}-state`}>
        {loading ? text.loading : ''}
        {state}
        {paneScale !== undefined && paneScale < 1 ? text.shrunk(Math.round(paneScale * 100)) : ''}
        {evicted.length > 0 ? text.evicted(evicted) : ''}
        {firedAlerts.length > 0 ? text.alerts(firedAlerts) : ''}
      </span>
      <span data-testid={`${testIdPrefix}-report`}>{report ?? ''}</span>
    </div>
  );
});
