/**
 * How each series is drawn, one radio group per series — and the group is born traversable.
 *
 * WHY THE GROUP CARRIES THE SERIES IN ITS NAME. There is one of these per series, and "line or
 * bars" alone never says whose. A reader landing on the second group would hear the same words it
 * heard on the first.
 *
 * WHY THE TAB STOP IS THE GROUP'S BUSINESS AND NOT THE BUTTON'S. A radio group has ONE tab stop,
 * not one per member; internal travel is by arrow. A button on its own cannot know it is the first.
 */
import { memo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';

import type { PaneSpec } from '../../domain/types';
import { useWorkspaceChrome } from '../chrome/ChromeContext';
import type { StylePickerLabels } from '../chrome/labels';
import { nextRovingIndex } from '../chrome/rovingFocus';
import { seriesStyleKey } from '../surface/ChartSurface';
import { useWorkspaceSetup } from './setupContext';

export interface SeriesStyleChoice {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  /** The shape the series declares, used while the setup holds no preference for it. */
  readonly declared: string;
}

/**
 * Every series the specs declare, as a choice — so the picker needs no second catalogue, and the
 * mapping sits with the type it produces instead of in the composition that happens to call it.
 */
export function styleChoicesOf(specs: readonly PaneSpec[]): SeriesStyleChoice[] {
  return specs.flatMap((spec) =>
    spec.series.map((series) => ({
      key: seriesStyleKey(String(spec.id), String(series.id)),
      label: series.label === '' ? String(series.id) : series.label,
      color: series.color, declared: series.shape,
    })),
  );
}

/** The two a chart can flip between without any series being born or dying. */
const DEFAULT_SHAPES: readonly string[] = ['line', 'histogram'];

/** Decoration only: the accessible name is the label above, never this character. */
const SHAPE_GLYPH: Readonly<Record<string, string>> = { line: '╱', histogram: '▥', area: '◣' };

export interface StylePickerRegionProps {
  readonly choices: readonly SeriesStyleChoice[];
  readonly onChange: (key: string, shape: string) => void;
  /** What this build can actually flip between. Offering a shape the chart cannot draw is a lie. */
  readonly shapes?: readonly string[];
}

const PANEL: CSSProperties = { maxHeight: 120, overflowY: 'auto', padding: '0 4px 4px' };

const GROUP: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  border: 'none',
  margin: '0 12px 4px 0',
  padding: 0,
};

interface StyleRadioGroupProps {
  readonly choice: SeriesStyleChoice;
  readonly current: string;
  readonly shapes: readonly string[];
  readonly labels: StylePickerLabels;
  readonly onChange: (key: string, shape: string) => void;
}

function StyleRadioGroup({
  choice,
  current,
  shapes,
  labels,
  onChange,
}: StyleRadioGroupProps): ReactElement {
  const { theme, components } = useWorkspaceChrome();
  const { IconButton } = components;
  const group = useRef<HTMLDivElement | null>(null);
  const checked = shapes.indexOf(current);
  // Exactly one member holds the tab stop, and with nothing checked the first one takes it: a group
  // with no tab stop is a group the keyboard cannot enter at all.
  const stop = checked < 0 ? 0 : checked;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const radios = Array.from(group.current?.querySelectorAll('button') ?? []);
    const focused = radios.indexOf(document.activeElement as HTMLButtonElement);
    const next = nextRovingIndex(event.key, focused, radios.length, 'horizontal');
    // `null` means the key is not ours, and swallowing it would steal Tab and the host's shortcuts.
    if (next === null) return;
    event.preventDefault();
    radios[next]?.focus();
  };

  return (
    // A `fieldset` would be the semantic set of controls, and it is refused here: an element the
    // platform calls non-interactive may not take an interactive role, so `radiogroup` needs a
    // neutral element under it. The keyboard contract above is what makes the role true.
    <div
      ref={group}
      role="radiogroup"
      aria-label={labels.group(choice.label)}
      onKeyDown={onKeyDown}
      style={{ ...GROUP, fontFamily: theme.fontFamily }}
    >
      <span style={{ color: choice.color, fontSize: 11, marginRight: 4 }}>{choice.label}</span>
      {shapes.map((shape, index) => (
        <IconButton
          key={shape}
          theme={theme}
          label={labels.shape(shape, choice.label)}
          state={{ kind: 'radio', checked: shape === current }}
          tabIndex={index === stop ? 0 : -1}
          onSelect={() => onChange(choice.key, shape)}
        >
          {SHAPE_GLYPH[shape] ?? shape}
        </IconButton>
      ))}
    </div>
  );
}

export const StylePickerRegion = memo(function StylePickerRegion({
  choices,
  onChange,
  shapes = DEFAULT_SHAPES,
}: StylePickerRegionProps): ReactElement {
  const { theme, components, labels, testIdPrefix } = useWorkspaceChrome();
  const text = labels.style;
  const { Pill } = components;
  const [open, setOpen] = useState(false);
  const styles = useWorkspaceSetup((setup) => setup.seriesStyles);

  return (
    <>
      <Pill
        theme={theme}
        state={{ kind: 'toggle', pressed: open }}
        onSelect={() => setOpen((shown) => !shown)}
      >
        {text.trigger}
      </Pill>
      {open ? (
        <div data-testid={`${testIdPrefix}-style-picker`} style={PANEL}>
          {choices.map((choice) => (
            <StyleRadioGroup
              key={choice.key}
              choice={choice}
              // The setup wins; the series' own declaration is the answer until someone chooses.
              current={styles[choice.key] ?? choice.declared}
              shapes={shapes}
              labels={text}
              onChange={onChange}
            />
          ))}
        </div>
      ) : null}
    </>
  );
});
