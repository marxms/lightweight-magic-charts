/**
 * The ceiling and the discard policy — measured by WHICH key left, never by the size alone.
 */
import {
  MAX_DRAWING_MEMORY,
  clearDrawingMemory,
  drawingMemoryFor,
  rememberedMarkets,
} from '../src/drawing/drawingMemory';

const marketsUpTo = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `M${index}`);

beforeEach(() => {
  clearDrawingMemory();
});

describe('the drawing memory is bounded', () => {
  it('declares a ceiling as a named constant rather than a loose literal', () => {
    expect(MAX_DRAWING_MEMORY).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_DRAWING_MEMORY)).toBe(true);
  });

  it('discards the LEAST RECENTLY USED key, and keeps every other one', () => {
    for (const market of marketsUpTo(MAX_DRAWING_MEMORY)) drawingMemoryFor(market);
    expect(rememberedMarkets()).toEqual(marketsUpTo(MAX_DRAWING_MEMORY));

    drawingMemoryFor('OVERFLOW');

    // Naming the survivors as well as the casualty: asserting the size alone would pass under any
    // policy, including one that wiped the map and kept the newcomer.
    expect(rememberedMarkets()).toEqual([...marketsUpTo(MAX_DRAWING_MEMORY).slice(1), 'OVERFLOW']);
    expect(rememberedMarkets()).not.toContain('M0');
    expect(rememberedMarkets()).toHaveLength(MAX_DRAWING_MEMORY);
  });

  it('counts a READ as use, so the market somebody keeps returning to is not the one evicted', () => {
    for (const market of marketsUpTo(MAX_DRAWING_MEMORY)) drawingMemoryFor(market);

    // The oldest by creation is touched, which must make the SECOND oldest the casualty.
    drawingMemoryFor('M0');
    drawingMemoryFor('OVERFLOW');

    expect(rememberedMarkets()).toContain('M0');
    expect(rememberedMarkets()).not.toContain('M1');
  });

  it('hands back the SAME record for a market it already knows', () => {
    const first = drawingMemoryFor('AAA');
    first.snapshot = { shapes: 3 };
    expect(drawingMemoryFor('AAA')).toBe(first);
    expect(drawingMemoryFor('AAA').snapshot).toEqual({ shapes: 3 });
  });

  it('keeps the drawings of one market out of another', () => {
    drawingMemoryFor('AAA').snapshot = { shapes: 3 };
    expect(drawingMemoryFor('BBB').snapshot).toBeNull();
  });
});
