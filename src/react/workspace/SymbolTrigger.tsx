/**
 * The current market, shown, and the request to change it, emitted.
 * See docs/explanation/react-workspace.md#why-the-trigger-announces-no-popup
 */
import { memo } from 'react';
import type { ReactElement } from 'react';

import { useWorkspaceChrome } from '../chrome/ChromeContext';

export interface SymbolTriggerProps {
  readonly symbol: string;
  readonly onSymbolRequest: (symbol: string) => void;
}

export const SymbolTrigger = memo(function SymbolTrigger({
  symbol,
  onSymbolRequest,
}: SymbolTriggerProps): ReactElement {
  const { theme, components, labels } = useWorkspaceChrome();
  const text = labels.symbol;
  const { Pill } = components;
  return (
    <Pill
      theme={theme}
      state={{ kind: 'action' }}
      label={text.trigger(symbol)}
      // READ AT PRESS TIME, never at mount. See docs/explanation/react-workspace.md#read-at-press-time
      onSelect={() => onSymbolRequest(symbol)}
    >
      {symbol === '' ? text.empty : symbol}
    </Pill>
  );
});
