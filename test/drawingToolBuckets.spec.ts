/**
 * THE CATALOGUE'S GROUPING, exercised without a browser.
 *
 * Runs in the `node` environment: there is no `document` here, and that is the cheapest proof that
 * splitting a list needs no DOM. While the function lived inside the component, every branch was
 * only reachable by mounting a React tree.
 *
 * THE BRANCH THAT MATTERS IS THE LEFTOVER ONE. A grouping that only draws what it recognises loses
 * the tool of an unknown category — and the `<optgroup>` this flyout replaced was born with exactly
 * that trap.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LEFTOVER_BUCKET_ID,
  bucketDrawingTools,
  type DrawingToolGroup,
  type DrawingToolOption,
} from '../src/react/drawingToolBuckets';

const LABELS = { allTools: 'All tools', otherTools: 'Other tools' };

const GROUPS: readonly DrawingToolGroup[] = [
  { id: 'lines', label: 'Lines', glyph: '╱' },
  { id: 'channels', label: 'Channels', glyph: '⫽' },
];

const CATALOGUE: readonly DrawingToolOption[] = [
  { id: 'trend-line', name: 'Trend line', group: 'lines' },
  { id: 'parallel-channel', name: 'Parallel channel', group: 'channels' },
  { id: 'ray', name: 'Ray', group: 'lines' },
];

describe('bucketDrawingTools — the order and the content of the families', () => {
  it("splits in the HOST's order, not alphabetically, and joins what arrived apart", () => {
    const buckets = bucketDrawingTools(CATALOGUE, GROUPS, LABELS);

    // Whoever knows the domain decides which family comes first; the lib never reads the string's
    // content.
    expect(buckets.map((bucket) => bucket.id)).toEqual(['lines', 'channels']);
    expect(buckets[0]?.options.map((option) => option.id)).toEqual(['trend-line', 'ray']);
    expect(buckets[0]?.label).toBe('Lines');
    expect(buckets[0]?.glyph).toBe('╱');
  });

  it('a DECLARED and empty family does not become a trigger', () => {
    const buckets = bucketDrawingTools(
      [{ id: 'ray', name: 'Ray', group: 'lines' }],
      GROUPS,
      LABELS,
    );
    // A button that opens an empty panel only spends the rail's height, which is the axis the host
    // pays for.
    expect(buckets.map((bucket) => bucket.id)).toEqual(['lines']);
  });
});

describe('bucketDrawingTools — grouping never costs reach', () => {
  it('the entry with NO family falls into the leftover, instead of vanishing from the list', () => {
    const buckets = bucketDrawingTools(
      [...CATALOGUE, { id: 'nameless', name: 'Nameless' }],
      GROUPS,
      LABELS,
    );

    const leftover = buckets.find((bucket) => bucket.id === LEFTOVER_BUCKET_ID);
    expect(leftover?.options.map((option) => option.id)).toEqual(['nameless']);
    expect(leftover?.label).toBe('Other tools');
  });

  it('the entry of an UNDECLARED family also falls into the leftover', () => {
    // POSITIVE CONTROL for the case above: here the entry HAS `group`, and even so there is no
    // family for it. A grouping that trusted the field's presence would lose it.
    const buckets = bucketDrawingTools(
      [{ id: 'wormhole', name: 'Wormhole', group: 'teleport' }],
      GROUPS,
      LABELS,
    );
    expect(buckets.map((bucket) => bucket.id)).toEqual([LEFTOVER_BUCKET_ID]);
  });

  it('with NO declared family at all, the leftover is named after the whole catalogue', () => {
    const buckets = bucketDrawingTools(CATALOGUE, [], LABELS);

    // "The others" would be ALL of them, and then the honest name is that of the whole catalogue.
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.label).toBe('All tools');
    expect(buckets[0]?.options).toHaveLength(CATALOGUE.length);
  });

  it('EVERY entry in the catalogue is reachable through some family', () => {
    const catalogue = [...CATALOGUE, { id: 'nameless', name: 'Nameless' }];
    const reached = bucketDrawingTools(catalogue, GROUPS, LABELS).flatMap((bucket) =>
      bucket.options.map((option) => option.id),
    );
    expect(new Set(reached)).toEqual(new Set(catalogue.map((option) => option.id)));
  });

  it('an empty catalogue invents no family', () => {
    expect(bucketDrawingTools([], GROUPS, LABELS)).toEqual([]);
  });
});

describe('drawingToolBuckets — the module does not import React', () => {
  it('declares no import of `react` at all', () => {
    // The criterion is structural and has no runtime symptom: a React import here compiles, passes
    // every behaviour test, and only shows up as weight in the bundle of whoever imports the bill.
    const source = readFileSync(join(__dirname, '../src/react/drawingToolBuckets.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]react/);
    expect(source).not.toMatch(/require\(\s*['"]react/);
  });
});
