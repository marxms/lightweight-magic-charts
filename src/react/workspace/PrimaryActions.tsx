/**
 * Auto-fit and the price line: two header buttons that share nothing, side by side.
 * See docs/explanation/react-workspace.md#one-region-because-they-fail-together
 */
import { memo } from 'react';
import type { ReactElement } from 'react';

import { useWorkspaceChrome } from '../chrome/ChromeContext';
import { useWorkspaceSetup } from './setupContext';

/**
 * Clear of the close, deliberately. See docs/explanation/react-workspace.md#clear-of-the-close
 */
const NEW_LEVEL_OFFSET = 1.004;

export const newAlertLevel = (lastClose: number): number => lastClose * NEW_LEVEL_OFFSET;

export interface PriceLineAction {
  /** `null` = no bars, so there is no price to put a line near, and the control says so. */
  readonly lastClose: number | null;
  readonly onAdd: (price: number) => void;
}

export interface PrimaryActionsProps {
  readonly onAutoFitToggle: () => void;
  readonly priceLine: PriceLineAction;
}

export const PrimaryActions = memo(function PrimaryActions({
  onAutoFitToggle,
  priceLine: { lastClose, onAdd },
}: PrimaryActionsProps): ReactElement {
  const { theme, components, labels } = useWorkspaceChrome();
  const text = labels.primary;
  const { IconButton } = components;
  const autoFit = useWorkspaceSetup((setup) => setup.autoFit);

  return (
    <>
      <IconButton
        theme={theme}
        label={text.autoFit}
        state={{ kind: 'toggle', pressed: autoFit }}
        onSelect={onAutoFitToggle}
      >
        ⤢
      </IconButton>
      <IconButton
        theme={theme}
        label={text.addPriceLine}
        disabled={lastClose === null}
        onSelect={lastClose === null ? undefined : () => onAdd(newAlertLevel(lastClose))}
      >
        +
      </IconButton>
    </>
  );
});
