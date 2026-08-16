/**
 * @jest-environment jsdom
 *
 * The internal primitives, against the two things they promise that do not show up in a screenshot:
 * that EVERY colour comes from the injected theme, and that they are not extension points.
 *
 * A primitive with a hardcoded colour renders perfectly under the default theme and vanishes under
 * the host's theme — the defect only exists in the tree of whoever adopted the library. That is why
 * every painting test here uses an INVENTED theme, whose values do not exist in the default.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';

import { Box, Column, Row, Text } from '../src/react/chrome/primitives';
import { DEFAULT_WORKSPACE_THEME, type WorkspaceTheme } from '../src/react/theme';

/** None of these values appears in the default theme, so matching them proves injection. */
const ALIEN: WorkspaceTheme = {
  ...DEFAULT_WORKSPACE_THEME,
  text: 'rgb(1, 2, 3)',
  surface: 'rgb(4, 5, 6)',
  fontFamily: 'Alien Sans',
};

describe('LMC-11 — chrome painted only with the injected theme’s tokens', () => {
  it('paints the box with the surface token of the RECEIVED theme, not with the default', () => {
    render(
      <Box theme={ALIEN} testId="box">
        content
      </Box>,
    );
    const box = screen.getByTestId('box');
    expect(box.style.background).toBe('rgb(4, 5, 6)');
    expect(box.style.color).toBe('rgb(1, 2, 3)');
    expect(box.style.fontFamily).toBe('Alien Sans');
  });

  it('paints the text with the text token of the RECEIVED theme', () => {
    render(
      <Text theme={ALIEN} testId="text">
        reading
      </Text>,
    );
    const text = screen.getByTestId('text');
    expect(text.style.color).toBe('rgb(1, 2, 3)');
    expect(text.style.fontFamily).toBe('Alien Sans');
  });

  it('emits no `class` on any of the four — no stylesheet, no CSS-in-JS runtime', () => {
    render(
      <Box theme={ALIEN} testId="box">
        <Row testId="row">
          <Column testId="column">
            <Text theme={ALIEN} testId="text">
              reading
            </Text>
          </Column>
        </Row>
      </Box>,
    );
    for (const id of ['box', 'row', 'column', 'text']) {
      expect(screen.getByTestId(id).getAttribute('class')).toBeNull();
    }
  });

  it('declares no focus ring on any of the four, letting the browser’s native one stand', () => {
    render(
      <Box theme={ALIEN} testId="box">
        <Row testId="row">
          <Column testId="column">
            <Text theme={ALIEN} testId="text">
              reading
            </Text>
          </Column>
        </Row>
      </Box>,
    );
    for (const id of ['box', 'row', 'column', 'text']) {
      expect(screen.getByTestId(id).style.outline).toBe('');
    }
  });

  it('stacks in a row and in a column, which is the only thing Row and Column do', () => {
    render(
      <>
        <Row gap={8} testId="row">
          a
        </Row>
        <Column gap={4} testId="column">
          b
        </Column>
      </>,
    );
    const row = screen.getByTestId('row');
    const column = screen.getByTestId('column');
    expect(row.style.display).toBe('flex');
    expect(row.style.flexDirection).toBe('row');
    expect(row.style.gap).toBe('8px');
    expect(column.style.display).toBe('flex');
    expect(column.style.flexDirection).toBe('column');
    expect(column.style.gap).toBe('4px');
  });
});

describe('LMC-14 — layout and text stay INTERNAL, outside the slot contract', () => {
  const SLOTS = readFileSync(
    join(__dirname, '..', 'src', 'react', 'chrome', 'slots.ts'),
    'utf8',
  );

  /** The members declared inside the `WorkspaceComponents` block, read from the source. */
  function declaredRoles(): string[] {
    const block = /export interface WorkspaceComponents \{([\s\S]*?)\n\}/.exec(SLOTS);
    if (block === null) throw new Error('WorkspaceComponents was not found in slots.ts');
    return Array.from(block[1].matchAll(/^\s*readonly (\w+)\??:/gm)).map((m) => m[1]);
  }

  it('exposes exactly the five chrome roles, and no sixth', () => {
    expect(declaredRoles().sort()).toEqual(
      ['IconButton', 'Notice', 'Pill', 'Toggle', 'Tooltip'].sort(),
    );
  });

  it('does not offer Box, Row, Column or Text as a replaceable role', () => {
    const roles = declaredRoles();
    for (const primitive of ['Box', 'Row', 'Column', 'Text']) {
      expect(roles).not.toContain(primitive);
    }
  });
});
