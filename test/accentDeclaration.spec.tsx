/**
 * @jest-environment jsdom
 *
 * The pressed pair, serialised as the browser reads it, in BOTH states.
 *
 * Six declarations carried the same two lines — `accentFill` over `transparent` for the background,
 * `accentText` over `text` for the foreground — and both halves depend on the same flag. That is
 * why every site below is pinned twice: a helper that dropped the flag would serialise the
 * unpressed control correctly and paint every pressed one in the resting colours, and a suite that
 * only ever mounted the pressed state would say nothing about it.
 *
 * WHY THE COLOURS ARE WRITTEN OUT AND NOT READ FROM THE THEME. `expect(style).toContain(
 * theme.accentFill)` passes when both halves read the same token, which is exactly the mistake a
 * two-token helper can make. The literals below are what jsdom serialised BEFORE the collapse, so
 * fill and text are two different strings that cannot be satisfied by one token.
 *
 * ORDER IS PART OF IT, for the same reason as `rowDeclaration.spec.tsx`: React writes inline styles
 * in insertion order, and the pair sits in the middle of five of these six declarations.
 *
 * The rail tab is the seventh element and it is already pinned, in both states, by
 * `seriesMenuRailStyle.spec.tsx`. The compact cell's timeframe button is pinned where its harness
 * lives, in `compactCell.spec.tsx`.
 */
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';

import type { SeriesProvider } from '../src/extension/plugins';
import { SeriesMenu } from '../src/react/SeriesMenu';
import type { SeriesCatalogueEntry } from '../src/react/SeriesMenu';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import { FlyoutMenu } from '../src/react/chrome/FlyoutMenu';
import { IconButton } from '../src/react/chrome/IconButton';
import { Pill } from '../src/react/chrome/Pill';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';

const THEME = DEFAULT_WORKSPACE_THEME;

const styleOf = (element: Element | null | undefined): string =>
  element?.getAttribute('style') ?? '';

/** The two halves, as jsdom serialises them. Pressed and resting are four different strings. */
const PRESSED = 'background: rgba(41, 98, 255, 0.22); color: rgb(255, 255, 255);';
const RESTING = 'background: transparent; color: rgb(184, 188, 196);';

const provider = (id: string): SeriesProvider =>
  ({
    id,
    spec: { id, label: id, shape: 'line', color: '#fff' },
    points: () => [],
  }) as unknown as SeriesProvider;

const CATALOGUE: readonly SeriesCatalogueEntry[] = [
  { provider: provider('rsi'), label: 'RSI', category: 'Momentum' },
  { provider: provider('macd'), label: 'MACD', category: 'Momentum' },
];

function mountPills(): void {
  render(
    <>
      <Pill theme={THEME} state={{ kind: 'toggle', pressed: true }} label="on">
        on
      </Pill>
      <Pill theme={THEME} state={{ kind: 'toggle', pressed: false }} label="off">
        off
      </Pill>
    </>,
  );
}

function mountFlyout(): void {
  render(
    <FlyoutMenu
      id="flyout"
      label="Flyout"
      items={[
        { id: 'one', label: 'One', selected: true },
        { id: 'two', label: 'Two' },
      ]}
      onSelect={() => undefined}
      onClose={() => undefined}
      rootRef={{ current: null }}
      triggerRef={{ current: null }}
      theme={THEME}
      testIdPrefix="fly"
    />,
  );
}

function mountChips(): ReactElement {
  return (
    <WorkspaceChromeProvider>
      <SeriesMenu catalogue={CATALOGUE} selected={['RSI']} onSelect={() => undefined} />
    </WorkspaceChromeProvider>
  );
}

describe('the pressed pair, serialised as it was before the collapse', () => {
  it('paints the chip both ways, and the two ways differ in more than the border', () => {
    render(mountChips());
    expect(styleOf(screen.getByTestId('series-menu-entry-rsi'))).toBe(
      'padding: 4px 10px; margin: 0px 5px 5px 0px; cursor: pointer; border-radius: 4px;' +
        ` border: 1px solid #2962ff; font-size: 11.5px; ${PRESSED} text-align: left;`,
    );
    expect(styleOf(screen.getByTestId('series-menu-entry-macd'))).toBe(
      'padding: 4px 10px; margin: 0px 5px 5px 0px; cursor: pointer; border-radius: 4px;' +
        ` border: 1px solid rgba(255,255,255,0.14); font-size: 11.5px; ${RESTING} text-align: left;`,
    );
  });

  it('paints the flyout item both ways', () => {
    mountFlyout();
    const shared =
      'display: flex; align-items: center; justify-content: space-between; gap: 16px;' +
      ' width: 100%; padding: 6px 8px; cursor: pointer; text-align: left;';
    expect(styleOf(screen.getByTestId('fly-option-one'))).toBe(
      `${shared} border: 1px solid #2962ff; border-radius: 4px; ${PRESSED}` +
        ' font-size: 12px; font-family: inherit;',
    );
    expect(styleOf(screen.getByTestId('fly-option-two'))).toBe(
      `${shared} border: 1px solid transparent; border-radius: 4px; ${RESTING}` +
        ' font-size: 12px; font-family: inherit;',
    );
  });

  it('paints the glyph button both ways', () => {
    render(
      <>
        <IconButton theme={THEME} label="on" state={{ kind: 'toggle', pressed: true }} testId="on">
          x
        </IconButton>
        <IconButton
          theme={THEME}
          label="off"
          state={{ kind: 'toggle', pressed: false }}
          testId="off"
        >
          x
        </IconButton>
      </>,
    );
    const shared =
      'display: inline-flex; align-items: center; justify-content: center; width: 28px;' +
      ' height: 28px; padding: 0px; border-radius: 4px;';
    const tail = ' font-family: Inter, system-ui, sans-serif; font-size: 14px; cursor: pointer;';
    expect(styleOf(screen.getByTestId('on'))).toBe(
      `${shared} border: 1px solid #2962ff; ${PRESSED}${tail} opacity: 1; flex-shrink: 0;`,
    );
    expect(styleOf(screen.getByTestId('off'))).toBe(
      `${shared} border: 1px solid transparent; ${RESTING}${tail} opacity: 1; flex-shrink: 0;`,
    );
  });

  it('paints the text chip both ways', () => {
    mountPills();
    const shared = 'padding: 4px 10px; cursor: pointer; border-radius: 4px;';
    const tail = ' font-size: 11.5px; font-family: Inter, system-ui, sans-serif;';
    expect(styleOf(screen.getByRole('button', { name: 'on' }))).toBe(
      `${shared} border: 1px solid #2962ff;${tail} ${PRESSED} text-align: left; opacity: 1;`,
    );
    expect(styleOf(screen.getByRole('button', { name: 'off' }))).toBe(
      `${shared} border: 1px solid rgba(255,255,255,0.14);${tail} ${RESTING}` +
        ' text-align: left; opacity: 1;',
    );
  });

  it('keeps the two halves DIFFERENT tokens, in every control it reaches', () => {
    // THE CLAUSE THE PER-SITE PINS CANNOT STATE. What makes this one declaration is that the fill
    // and the foreground are two tokens read together and never the same one. A helper that read
    // `accentFill` twice would satisfy any assertion phrased against the theme object; here the
    // four serialised strings are compared to each other, and a one-token helper collapses two of
    // the four into one.
    render(mountChips());
    mountFlyout();
    const pressed = [
      styleOf(screen.getByTestId('series-menu-entry-rsi')),
      styleOf(screen.getByTestId('fly-option-one')),
    ];
    const resting = [
      styleOf(screen.getByTestId('series-menu-entry-macd')),
      styleOf(screen.getByTestId('fly-option-two')),
    ];
    for (const style of pressed) expect(style).toContain(PRESSED);
    for (const style of resting) expect(style).toContain(RESTING);
    expect(PRESSED).not.toBe(RESTING);
    expect(THEME.accentFill).not.toBe(THEME.accentText);
  });
});
