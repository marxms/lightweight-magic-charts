/**
 * @jest-environment jsdom
 *
 * The symbol trigger, and the absence that lets it stay a trigger: no dialog anywhere in `src`.
 */
import { join } from 'path';
import type { ReactElement, ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import type { PillProps } from '../src/react/chrome/slots';
import { SymbolTrigger } from '../src/react/workspace/SymbolTrigger';
import { collectSources, stripComments, type Source } from './gates/sourceScan';

const SRC = join(__dirname, '..', 'src');

/**
 * What a dialog looks like in source, whichever way it is built. Broad on purpose: narrowing this
 * list is the act that needs review, and the positive control below exercises every entry.
 */
const DIALOG_SHAPES: readonly RegExp[] = [
  /\bcreatePortal\b/,
  /role\s*=\s*['"{]?\s*['"]dialog['"]/,
  /\baria-modal\b/,
  /<dialog\b/,
  /\bshowModal\b/,
  /\bfocus-?[Tt]rap\b/,
];

/** Comments stripped first: prose that NAMES the ban is the opposite of a breach of it. */
function dialogHits(list: readonly Source[]): string[] {
  return list.flatMap((source) => {
    const text = stripComments(source.text);
    return DIALOG_SHAPES.filter((shape) => shape.test(text)).map(
      (shape) => `FAIL ${source.file} :: dialog shape ${String(shape)}`,
    );
  });
}

function Chrome({ children }: { readonly children: ReactNode }): ReactElement {
  return <WorkspaceChromeProvider>{children}</WorkspaceChromeProvider>;
}

describe('the symbol trigger', () => {
  it('shows the current market on its face and says what pressing it does', () => {
    render(
      <Chrome>
        <SymbolTrigger symbol="AAA-BBB" onSymbolRequest={() => undefined} />
      </Chrome>,
    );
    const trigger = screen.getByRole('button', { name: 'Market: AAA-BBB' });
    expect(trigger).toHaveTextContent('AAA-BBB');
  });

  it('offers something to aim at, and a different name, before anything is chosen', () => {
    render(
      <Chrome>
        <SymbolTrigger symbol="" onSymbolRequest={() => undefined} />
      </Chrome>,
    );
    expect(screen.getByRole('button', { name: 'Choose a market' })).toHaveTextContent('Market');
  });

  it('hands back THE CURRENT symbol, and a second market proves it is not a fixed value', () => {
    const asked: string[] = [];
    const { rerender } = render(
      <Chrome>
        <SymbolTrigger symbol="AAA-BBB" onSymbolRequest={(symbol) => asked.push(symbol)} />
      </Chrome>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Market: AAA-BBB' }));

    // The SAME mounted trigger, moved to another market. A handler that captured the first symbol
    // reports it twice, and a first assertion alone would have called that correct.
    rerender(
      <Chrome>
        <SymbolTrigger symbol="CCC-DDD" onSymbolRequest={(symbol) => asked.push(symbol)} />
      </Chrome>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Market: CCC-DDD' }));
    expect(asked).toEqual(['AAA-BBB', 'CCC-DDD']);
  });

  it('goes through the host chrome role rather than around it', () => {
    render(
      <WorkspaceChromeProvider
        components={{
          Pill: ({ children, onSelect, label }: PillProps) => (
            <button type="button" aria-label={label} data-testid="host-pill" onClick={onSelect}>
              {children}
            </button>
          ),
        }}
      >
        <SymbolTrigger symbol="AAA-BBB" onSymbolRequest={() => undefined} />
      </WorkspaceChromeProvider>,
    );
    expect(screen.getByTestId('host-pill')).toHaveTextContent('AAA-BBB');
  });
});

describe('the package holds no dialog, portal or focus trap', () => {
  const sources = collectSources(SRC);

  it('reads a non-trivial tree, so a green guard is not a guard over nothing', () => {
    expect(sources.length).toBeGreaterThanOrEqual(30);
  });

  it('finds none of the shapes in src', () => {
    expect(dialogHits(sources)).toEqual([]);
  });

  it('fails a planted file for every shape it claims to catch', () => {
    // POSITIVE CONTROL. The clause is an ABSENCE, and an absence measured by a broken scan passes
    // in silence. Each shape gets its own planted line through the identical predicate.
    const planted: Source[] = [
      { file: 'planted/Portal.tsx', text: 'createPortal(<x />, document.body);' },
      { file: 'planted/Role.tsx', text: '<div role="dialog" />' },
      { file: 'planted/Modal.tsx', text: '<div aria-modal="true" />' },
      { file: 'planted/Native.tsx', text: '<dialog open>hello</dialog>' },
      { file: 'planted/Show.ts', text: 'node.showModal();' },
      { file: 'planted/Trap.ts', text: 'const focusTrap = install(node);' },
    ];
    expect(dialogHits(planted).map((hit) => hit.split(' :: ')[0])).toEqual([
      'FAIL planted/Portal.tsx',
      'FAIL planted/Role.tsx',
      'FAIL planted/Modal.tsx',
      'FAIL planted/Native.tsx',
      'FAIL planted/Show.ts',
      'FAIL planted/Trap.ts',
    ]);
  });

  it('does not fire on prose that names the ban', () => {
    // The comment explaining "no portal, no focus trap" must not be the thing that fails the guard.
    expect(
      dialogHits([{ file: 'planted/Prose.ts', text: '// no createPortal and no focusTrap here' }]),
    ).toEqual([]);
  });
});
