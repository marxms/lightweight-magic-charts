/**
 * THE ARITHMETIC OF TRAVERSAL, exercised without a browser.
 *
 * This file runs in the `node` environment — there is no `document` here, and that is the cheapest
 * proof that the calculation does not depend on DOM. A test that needed `jsdom` to check "what comes
 * after the last one" would be the sign that the sum leaked into the handler.
 *
 * THE EDGES ARE THE SUBJECT. Going from the middle to the middle works in any implementation,
 * including a broken one; what separates the two is what happens at the end, in the empty group and
 * on a key that is not on the group's axis.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { nextRovingIndex } from '../src/react/chrome/rovingFocus';

describe('LMC-61 — the arrow moves to the matching control of the VERTICAL group', () => {
  it('goes forward with the down arrow and back with the up arrow', () => {
    expect(nextRovingIndex('ArrowDown', 0, 4, 'vertical')).toBe(1);
    expect(nextRovingIndex('ArrowUp', 2, 4, 'vertical')).toBe(1);
  });

  it('WRAPS AROUND at both edges: from the last to the first, and from the first to the last', () => {
    // Stopping here is indistinguishable from a handler that was never wired.
    expect(nextRovingIndex('ArrowDown', 3, 4, 'vertical')).toBe(0);
    expect(nextRovingIndex('ArrowUp', 0, 4, 'vertical')).toBe(3);
  });

  it('ignores the OTHER axis: in a vertical group, left and right are not its own', () => {
    expect(nextRovingIndex('ArrowLeft', 2, 4, 'vertical')).toBeNull();
    expect(nextRovingIndex('ArrowRight', 2, 4, 'vertical')).toBeNull();
  });
});

describe('LMC-61 — the arrow moves to the matching control of the HORIZONTAL group', () => {
  it('goes forward with the right arrow and back with the left arrow', () => {
    expect(nextRovingIndex('ArrowRight', 0, 3, 'horizontal')).toBe(1);
    expect(nextRovingIndex('ArrowLeft', 2, 3, 'horizontal')).toBe(1);
  });

  it('WRAPS AROUND at both edges', () => {
    expect(nextRovingIndex('ArrowRight', 2, 3, 'horizontal')).toBe(0);
    expect(nextRovingIndex('ArrowLeft', 0, 3, 'horizontal')).toBe(2);
  });

  it('ignores the OTHER axis: on a horizontal bar, up and down are not its own', () => {
    expect(nextRovingIndex('ArrowUp', 1, 3, 'horizontal')).toBeNull();
    expect(nextRovingIndex('ArrowDown', 1, 3, 'horizontal')).toBeNull();
  });
});

describe('LMC-61 — Home and End go to the ends, on both axes', () => {
  it('Home hands back the first and End hands back the last', () => {
    expect(nextRovingIndex('Home', 3, 5, 'vertical')).toBe(0);
    expect(nextRovingIndex('End', 1, 5, 'vertical')).toBe(4);
    expect(nextRovingIndex('Home', 3, 5, 'horizontal')).toBe(0);
    expect(nextRovingIndex('End', 1, 5, 'horizontal')).toBe(4);
  });
});

describe('rovingFocus — what the function refuses, so the caller does not cancel the event', () => {
  it('returns null for a key that is not a traversal key', () => {
    // The caller uses this null to NOT call `preventDefault`: a handler that swallows every key
    // steals Tab, typing and the host's shortcuts.
    for (const key of ['Tab', 'Enter', ' ', 'a', 'Escape']) {
      expect(nextRovingIndex(key, 1, 4, 'vertical')).toBeNull();
    }
  });

  it('returns null for an EMPTY group, on any key', () => {
    // The size comes from a read of the DOM, and a group with no control at all is reachable: a
    // menu filtered to zero, a rail with no tool. Returning 0 would point at a nonexistent item.
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      expect(nextRovingIndex(key, -1, 0, 'vertical')).toBeNull();
    }
  });

  it('with NOTHING focused, forward hands back the first and back hands the last', () => {
    expect(nextRovingIndex('ArrowDown', -1, 4, 'vertical')).toBe(0);
    expect(nextRovingIndex('ArrowUp', -1, 4, 'vertical')).toBe(3);
    expect(nextRovingIndex('ArrowRight', -1, 4, 'horizontal')).toBe(0);
    expect(nextRovingIndex('ArrowLeft', -1, 4, 'horizontal')).toBe(3);
  });
});

describe('rovingFocus — the module imports no React', () => {
  it('declares no import of `react` whatsoever', () => {
    // The criterion is structural and has no runtime symptom: a React import here compiles, passes
    // every behaviour test, and only shows up as weight in the bundle of whoever imports the sum.
    const source = readFileSync(join(__dirname, '../src/react/chrome/rovingFocus.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]react/);
    expect(source).not.toMatch(/require\(\s*['"]react/);
  });
});
