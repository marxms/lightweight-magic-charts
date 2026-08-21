/**
 * @jest-environment jsdom
 *
 * The rail's two kinds of tab, pinned as the browser reads them.
 *
 * A host section and a catalogue category are the same control with one difference — the section
 * carries a count, so it lays out as a row — and the two declarations had drifted into two copies
 * of nine shared properties. Collapsing them is only safe if the SERIALISED declaration is
 * unchanged, and inline-style ORDER is part of that: React writes the properties in insertion
 * order, so a factory that reorders them repaints the same pixels through a different `style`
 * attribute and nothing else in this suite would notice.
 *
 * Both states are pinned because half the declaration depends on `active`: a factory that dropped
 * the flag would still serialise the inactive tab correctly.
 *
 * DECLARED BLIND SPOT: `border: none`. It is in both declarations and in neither pin, because jsdom
 * cannot show it. It is absent from the serialised attribute — `border-left` is set after it, so the
 * shorthand has no text of its own left to print — and it is absent from the longhands too:
 * `style.borderTopStyle` reads empty and `getComputedStyle` reads `outset`, the initial value, so
 * the assignment never reached them. Measured here, both ways, before this was written down. A
 * factory that dropped it would repaint a default border in a real browser and pass this file.
 */
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';

import { SeriesMenu } from '../src/react/SeriesMenu';
import type { SeriesCatalogueEntry } from '../src/react/SeriesMenu';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import type { WorkspaceSection } from '../src/react/chrome/ChromeContext';
import type { SeriesProvider } from '../src/extension/plugins';

const provider = (id: string): SeriesProvider =>
  ({
    id,
    spec: { id, label: id, shape: 'line', color: '#fff' },
    points: () => [],
  }) as unknown as SeriesProvider;

const CATALOGUE: readonly SeriesCatalogueEntry[] = [
  { provider: provider('rsi'), label: 'RSI', category: 'Momentum' },
];

function SectionBody(): ReactElement {
  return <span>authored</span>;
}

const SECTIONS: readonly WorkspaceSection[] = [
  { id: 'authored', label: 'Authored', count: 2, Body: SectionBody },
];

/** The rail selects its first tab on mount, so the host section is ACTIVE and the category is not. */
function mountRail(): void {
  render(
    <WorkspaceChromeProvider sections={SECTIONS}>
      <SeriesMenu catalogue={CATALOGUE} sections={SECTIONS} onSelect={() => undefined} />
    </WorkspaceChromeProvider>,
  );
}

const SECTION_TAB = 'series-menu-section-authored';
const CATEGORY_TAB = 'series-menu-category-Momentum';

const styleOf = (testId: string): string => screen.getByTestId(testId).getAttribute('style') ?? '';

/** The nine properties both tabs declare, in the order both of them declare them. */
const SHARED =
  'width: 100%; text-align: left; padding: 5px 10px; cursor: pointer; border-left: 2px solid ';

describe('the rail tab declaration', () => {
  it('serialises the ACTIVE host section exactly as it did before the factory', () => {
    mountRail();
    expect(styleOf(SECTION_TAB)).toBe(
      'display: flex; justify-content: space-between; align-items: center; gap: 6px; ' +
        `${SHARED}#2962FF; background: rgba(41, 98, 255, 0.22); color: rgb(255, 255, 255);` +
        ' font-size: 11.5px;',
    );
  });

  it('serialises the INACTIVE catalogue category exactly as it did before the factory', () => {
    mountRail();
    expect(styleOf(CATEGORY_TAB)).toBe(
      `display: block; ${SHARED}transparent; background: transparent;` +
        ' color: rgb(184, 188, 196); font-size: 11.5px;',
    );
  });

  it('keeps the two kinds apart: only the leading box declaration differs', () => {
    // The collapse claims nine properties are ONE declaration and that the difference is the lead.
    // A factory that folded the lead in too would serialise both tabs identically, which a per-tab
    // pin written from a single capture would accept — and the count row would lose its layout.
    mountRail();
    expect(styleOf(SECTION_TAB)).not.toBe(styleOf(CATEGORY_TAB));
    expect(styleOf(SECTION_TAB).startsWith('display: flex;')).toBe(true);
    expect(styleOf(CATEGORY_TAB).startsWith('display: block;')).toBe(true);
    expect(styleOf(SECTION_TAB)).toContain(SHARED);
    expect(styleOf(CATEGORY_TAB)).toContain(SHARED);
  });
});
