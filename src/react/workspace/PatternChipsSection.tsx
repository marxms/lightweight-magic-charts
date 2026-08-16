/**
 * The candle-pattern chips: which patterns are marking the chart right now.
 * See docs/explanation/react-workspace.md#the-active-set-is-session-state
 */
import { createContext, memo, useContext, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

import { useWorkspaceChrome } from '../chrome/ChromeContext';

export interface CandlePatternChoice {
  readonly id: string;
  /** The face of the chip — an abbreviation, where the full name would not fit. */
  readonly label: string;
  /** The full name, which becomes the accessible one. Absent, the face answers for both. */
  readonly name?: string;
}

interface CandlePatternsValue {
  readonly patterns: readonly CandlePatternChoice[];
  readonly onActiveChange?: (active: readonly string[]) => void;
}

const CandlePatternsContext = createContext<CandlePatternsValue>({ patterns: [] });

export interface CandlePatternsProviderProps extends CandlePatternsValue {
  readonly children: ReactNode;
}

export const CandlePatternsProvider = memo(function CandlePatternsProvider({
  patterns,
  onActiveChange,
  children,
}: CandlePatternsProviderProps): ReactElement {
  // Destructured identities in the dependencies, never the group: a host writing the list at the
  // call site hands over a new array each render.
  const value = useMemo(() => ({ patterns, onActiveChange }), [patterns, onActiveChange]);
  return <CandlePatternsContext.Provider value={value}>{children}</CandlePatternsContext.Provider>;
});

/** A real `fieldset`, bare: a named set of controls is exactly what this element means. */
const WRAP: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  border: 'none',
  margin: 0,
  padding: 0,
};

export const PatternChipsSection = memo(function PatternChipsSection(): ReactElement {
  const { theme, components, labels, testIdPrefix } = useWorkspaceChrome();
  const { Pill } = components;
  const { patterns, onActiveChange } = useContext(CandlePatternsContext);
  const [active, setActive] = useState<readonly string[]>([]);

  // Reported on every change AND on mount, so a fresh mount says "nothing marks" instead of
  // leaving the drawing side holding the set of whoever was here before.
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  const toggle = (id: string): void => {
    setActive((current) =>
      current.includes(id) ? current.filter((held) => held !== id) : [...current, id],
    );
  };

  return (
    <fieldset aria-label={labels.patterns.group} data-testid={`${testIdPrefix}-patterns`} style={WRAP}>
      {patterns.map((pattern) => (
        <Pill
          key={pattern.id}
          theme={theme}
          label={pattern.name}
          state={{ kind: 'toggle', pressed: active.includes(pattern.id) }}
          onSelect={() => toggle(pattern.id)}
        >
          {pattern.label}
        </Pill>
      ))}
    </fieldset>
  );
});
