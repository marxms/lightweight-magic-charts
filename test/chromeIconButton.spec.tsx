/**
 * @jest-environment jsdom
 *
 * The glyph-only control, and the failure the TYPE cannot reach.
 *
 * A required `label` protects whoever compiles TypeScript. A host in plain JavaScript, or one that
 * spreads an `any` object into the props, walks around the whole compiler and ships a button the
 * screen reader announces as "button" and nothing more. The runtime sensor exists for that case,
 * and only for it: in production it disappears, because the cost was already paid in development.
 */
import { createRef } from 'react';

import { render, screen } from '@testing-library/react';

import { IconButton } from '../src/react/chrome/IconButton';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';

const theme = DEFAULT_WORKSPACE_THEME;

/** The plain-JavaScript host the type cannot reach. */
const NO_LABEL = { label: '' } as { label: string };

describe('LMC-56 and LMC-57 — a native button with a mandatory accessible name', () => {
  it('renders a `button` of type `button` whose accessible name comes from `label`', () => {
    render(
      <IconButton theme={theme} label="Undo">
        ↶
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-label', 'Undo');
    expect(button).toHaveTextContent('↶');
  });

  it('takes `ref` as a plain prop, so whoever opens a panel returns focus to this trigger', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <IconButton theme={theme} label="All tools" ref={ref}>
        ⋯
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'All tools' });
    expect(ref.current).toBe(button);

    ref.current?.focus();
    expect(document.activeElement).toBe(button);
  });
});

describe('LMC-57 — the runtime sensor, for the host that walks around the type', () => {
  const NODE_ENV = process.env.NODE_ENV;
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    spy.mockRestore();
    process.env.NODE_ENV = NODE_ENV;
  });

  it('reports in development when `label` arrives empty', () => {
    render(
      <IconButton theme={theme} {...NO_LABEL}>
        ↶
      </IconButton>,
    );
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toMatch(/IconButton/);
    expect(String(spy.mock.calls[0][0])).toMatch(/label/);
  });

  it('reports AGAIN on the next mount — the warning is not a one-shot latch', () => {
    const { unmount } = render(
      <IconButton theme={theme} {...NO_LABEL}>
        ↶
      </IconButton>,
    );
    unmount();
    const first = spy.mock.calls.length;

    render(
      <IconButton theme={theme} {...NO_LABEL}>
        ↷
      </IconButton>,
    );
    expect(spy.mock.calls.length).toBeGreaterThan(first);
  });

  it('stays silent in production, where the sensor does not pay for itself', () => {
    process.env.NODE_ENV = 'production';
    render(
      <IconButton theme={theme} {...NO_LABEL}>
        ↶
      </IconButton>,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not report when the name is present', () => {
    render(
      <IconButton theme={theme} label="Undo">
        ↶
      </IconButton>,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('LMC-58 and LMC-56 — the state the glyph-only control announces', () => {
  it('with no state, it announces NO state at all: an action glyph has no on/off', () => {
    render(
      <IconButton theme={theme} label="Clear all">
        🗑
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Clear all' });
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(button).not.toHaveAttribute('aria-checked');
    expect(button).not.toHaveAttribute('aria-expanded');
    expect(button).not.toHaveAttribute('aria-haspopup');
  });

  it('as a PANEL TRIGGER, it declares the popup, whether it is open and what it controls', () => {
    const { rerender } = render(
      <>
        <IconButton
          theme={theme}
          label="Lines"
          state={{ kind: 'menu', expanded: false }}
          controls="lines-panel"
        >
          ╱
        </IconButton>
        <div id="lines-panel" />
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Lines' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // `aria-controls` with no target is worse than absent: the reader promises a panel that does
    // not exist.
    expect(document.getElementById(trigger.getAttribute('aria-controls') ?? '')).not.toBeNull();
    // A panel trigger that announces "pressed" invents a state it does not have.
    expect(trigger).not.toHaveAttribute('aria-pressed');

    rerender(
      <>
        <IconButton
          theme={theme}
          label="Lines"
          state={{ kind: 'menu', expanded: true }}
          controls="lines-panel"
        >
          ╱
        </IconButton>
        <div id="lines-panel" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Lines' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('as a RADIO ITEM, it takes the role and the checked state, never the pressed one', () => {
    const { rerender } = render(
      <IconButton theme={theme} label="Trend line" state={{ kind: 'radio', checked: true }}>
        ╱
      </IconButton>,
    );
    const armed = screen.getByRole('radio', { name: 'Trend line' });
    expect(armed).toHaveAttribute('aria-checked', 'true');
    expect(armed).not.toHaveAttribute('aria-pressed');

    rerender(
      <IconButton theme={theme} label="Trend line" state={{ kind: 'radio', checked: false }}>
        ╱
      </IconButton>,
    );
    expect(screen.getByRole('radio', { name: 'Trend line' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('as a TOGGLE, it emits the pressed state mirroring the value', () => {
    render(
      <IconButton theme={theme} label="Grid" state={{ kind: 'toggle', pressed: true }}>
        #
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('LMC-60 — the focus ring is the browser’s', () => {
  it('declares no focus ring, in any state at all', () => {
    render(
      <>
        <IconButton theme={theme} label="a">
          ↶
        </IconButton>
        <IconButton theme={theme} label="b" state={{ kind: 'toggle', pressed: true }}>
          ↷
        </IconButton>
        <IconButton theme={theme} label="c" state={{ kind: 'radio', checked: true }}>
          ╱
        </IconButton>
        <IconButton theme={theme} label="d" state={{ kind: 'menu', expanded: true }}>
          ⋯
        </IconButton>
      </>,
    );
    for (const name of ['a', 'b', 'c', 'd']) {
      const button = screen.getByLabelText(name);
      expect(button.style.outline).toBe('');
      expect(button.style.outlineWidth).toBe('');
    }
  });
});
