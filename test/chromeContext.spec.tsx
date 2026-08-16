/**
 * @jest-environment jsdom
 *
 * The resolution of the roles, and the three traps it disarms.
 *
 * The first: object spread. `{...DEFAULTS, ...components}` looks like it solves a partial override
 * and does not — a member that is explicitly undefined OVERWRITES the default with `undefined`, and
 * the role vanishes. The second: dependencies on the received object instead of on the destructured
 * identities — a host that writes `components={{ Pill: MyPill }}` in the JSX creates a new object on
 * every render, the context value changes every frame and every consumer reconciles. The third is
 * the same one seen by the user: the menu closes by itself and focus vanishes, and nobody connects
 * one thing to the other.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';

import { act, render, screen } from '@testing-library/react';

import {
  WorkspaceChromeProvider,
  useWorkspaceChrome,
  type WorkspaceChromeValue,
} from '../src/react/chrome/ChromeContext';
import { IconButton } from '../src/react/chrome/IconButton';
import { Notice } from '../src/react/chrome/Notice';
import { Pill } from '../src/react/chrome/Pill';
import { Toggle } from '../src/react/chrome/Toggle';
import { Tooltip } from '../src/react/chrome/Tooltip';
import type { PillProps } from '../src/react/chrome/slots';
import { DEFAULT_WORKSPACE_THEME, type WorkspaceTheme } from '../src/react/theme';

/** A host role, hoisted to module scope — the stable identity the contract asks for. */
function HostPill({ children }: PillProps): ReactElement {
  return (
    <button type="button" data-host="pill">
      {children}
    </button>
  );
}

function HostToggle(): ReactElement {
  return <button type="button" data-host="toggle" />;
}

/** Captures the context value on every render, so that its IDENTITY can be compared. */
function makeProbe(): { seen: WorkspaceChromeValue[]; Probe: () => null } {
  const seen: WorkspaceChromeValue[] = [];
  return {
    seen,
    Probe: (): null => {
      seen.push(useWorkspaceChrome());
      return null;
    },
  };
}

describe('LMC-12 and LMC-13 — the host role replaces, the omission inherits the default', () => {
  it('uses the host implementation on the role it supplied', () => {
    const { seen, Probe } = makeProbe();
    render(
      <WorkspaceChromeProvider components={{ Pill: HostPill }}>
        <Probe />
      </WorkspaceChromeProvider>,
    );
    expect(seen[0].components.Pill).toBe(HostPill);
  });

  it('keeps its own default on EVERY role the host did not bring', () => {
    const { seen, Probe } = makeProbe();
    render(
      <WorkspaceChromeProvider components={{ Pill: HostPill }}>
        <Probe />
      </WorkspaceChromeProvider>,
    );
    const resolved = seen[0].components;
    expect(resolved.IconButton).toBe(IconButton);
    expect(resolved.Toggle).toBe(Toggle);
    expect(resolved.Tooltip).toBe(Tooltip);
    expect(resolved.Notice).toBe(Notice);
  });

  it('resolves the five defaults when the host brings no `components` at all', () => {
    const { seen, Probe } = makeProbe();
    render(
      <WorkspaceChromeProvider>
        <Probe />
      </WorkspaceChromeProvider>,
    );
    expect(seen[0].components).toEqual({ Pill, IconButton, Toggle, Tooltip, Notice });
  });

  it('the resolved role is the one that actually renders, not just the one in the value', () => {
    function Consumer(): ReactElement {
      const { components, theme } = useWorkspaceChrome();
      return (
        <components.Pill theme={theme} state={{ kind: 'action' }}>
          Volume
        </components.Pill>
      );
    }
    render(
      <WorkspaceChromeProvider components={{ Pill: HostPill }}>
        <Consumer />
      </WorkspaceChromeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Volume' })).toHaveAttribute('data-host', 'pill');
  });
});

describe('LMC-15 — a partial override resolves MEMBER BY MEMBER, never by spread', () => {
  it('applies two host roles and keeps the other three on the default', () => {
    const { seen, Probe } = makeProbe();
    render(
      <WorkspaceChromeProvider components={{ Pill: HostPill, Toggle: HostToggle }}>
        <Probe />
      </WorkspaceChromeProvider>,
    );
    const resolved = seen[0].components;
    expect(resolved.Pill).toBe(HostPill);
    expect(resolved.Toggle).toBe(HostToggle);
    expect(resolved.IconButton).toBe(IconButton);
    expect(resolved.Tooltip).toBe(Tooltip);
    expect(resolved.Notice).toBe(Notice);
  });

  it('a member explicitly UNDEFINED falls back to the default, instead of erasing the role', () => {
    const { seen, Probe } = makeProbe();
    render(
      <WorkspaceChromeProvider components={{ Pill: undefined, Toggle: HostToggle }}>
        <Probe />
      </WorkspaceChromeProvider>,
    );
    // This is where object spread would fail: `undefined` would overwrite the default.
    expect(seen[0].components.Pill).toBe(Pill);
    expect(seen[0].components.Toggle).toBe(HostToggle);
  });

  it('a label brought by the host replaces only the member it brought', () => {
    const { seen, Probe } = makeProbe();
    render(
      <WorkspaceChromeProvider labels={{ dismiss: 'Fechar' }}>
        <Probe />
      </WorkspaceChromeProvider>,
    );
    expect(seen[0].labels.dismiss).toBe('Fechar');
  });
});

describe('the identity of the value does not change when nothing actually changed', () => {
  // The CONTROL case changes the identity on purpose, and the churn sensor flags it — correctly.
  // Silencing it here keeps the suite output legible without weakening anything: the sensor has its
  // own tests, right below.
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('a NEW object literal holding the same references does not change the context value', () => {
    const { seen, Probe } = makeProbe();
    const { rerender } = render(
      <WorkspaceChromeProvider components={{ Pill: HostPill }}>
        <Probe />
      </WorkspaceChromeProvider>,
    );
    rerender(
      <WorkspaceChromeProvider components={{ Pill: HostPill }}>
        <Probe />
      </WorkspaceChromeProvider>,
    );
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[1]).toBe(seen[0]);
  });

  it('CONTROL: a new role identity DOES change the value, else the memo would measure nothing', () => {
    const { seen, Probe } = makeProbe();
    const { rerender } = render(
      <WorkspaceChromeProvider components={{ Pill: HostPill }}>
        <Probe />
      </WorkspaceChromeProvider>,
    );
    rerender(
      <WorkspaceChromeProvider components={{ Pill: (props: PillProps) => HostPill(props) }}>
        <Probe />
      </WorkspaceChromeProvider>,
    );
    expect(seen[1]).not.toBe(seen[0]);
  });

  it('the value survives a render of the PARENT that touched nothing in the chrome', () => {
    const { seen, Probe } = makeProbe();
    function Host(): ReactElement {
      const [tick, setTick] = useState(0);
      return (
        <WorkspaceChromeProvider components={{ Pill: HostPill }}>
          <button type="button" onClick={() => setTick(tick + 1)}>
            tick {tick}
          </button>
          <Probe />
        </WorkspaceChromeProvider>
      );
    }
    render(<Host />);
    act(() => {
      screen.getByRole('button', { name: /tick/ }).click();
    });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(seen[0]);
  });
});

describe('the hook throws outside the provider', () => {
  it('throws instead of returning a filled default, which would hide a wrong mounting', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { Probe } = makeProbe();
    expect(() => render(<Probe />)).toThrow(/provider/i);
    spy.mockRestore();
  });
});

describe('the identity churn sensor', () => {
  const NODE_ENV = process.env.NODE_ENV;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    jest.useRealTimers();
    process.env.NODE_ENV = NODE_ENV;
  });

  function renderWith(pill: typeof HostPill, theme?: WorkspaceTheme) {
    return (
      <WorkspaceChromeProvider components={{ Pill: pill }} theme={theme}>
        <span />
      </WorkspaceChromeProvider>
    );
  }

  it('flags it when the identity of a role changes between renders', () => {
    const { rerender } = render(renderWith(HostPill));
    expect(warn).not.toHaveBeenCalled();

    rerender(renderWith((props: PillProps) => HostPill(props)));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/Pill/);
  });

  it('rate-limits: the next change, right afterwards, does not repeat the warning', () => {
    const { rerender } = render(renderWith(HostPill));
    rerender(renderWith((props: PillProps) => HostPill(props)));
    expect(warn).toHaveBeenCalledTimes(1);

    rerender(renderWith((props: PillProps) => HostPill(props)));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('flags again after the window — it is recurrent, and NEVER a one-off', () => {
    const { rerender } = render(renderWith(HostPill));
    rerender(renderWith((props: PillProps) => HostPill(props)));
    expect(warn).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    rerender(renderWith((props: PillProps) => HostPill(props)));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('watches the THEME too, not just the roles', () => {
    const { rerender } = render(renderWith(HostPill, DEFAULT_WORKSPACE_THEME));
    rerender(renderWith(HostPill, { ...DEFAULT_WORKSPACE_THEME }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/theme/);
  });

  it('watches the SECTIONS too — the same discipline holds for every member of the context', () => {
    const SECTIONS = [{ id: 'a', label: 'A', count: 0, Body: (): null => null }];
    const { rerender } = render(
      <WorkspaceChromeProvider sections={SECTIONS}>
        <span />
      </WorkspaceChromeProvider>,
    );
    rerender(
      <WorkspaceChromeProvider sections={[...SECTIONS]}>
        <span />
      </WorkspaceChromeProvider>,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/sections/);
  });

  it('goes quiet in production', () => {
    process.env.NODE_ENV = 'production';
    const { rerender } = render(renderWith(HostPill));
    rerender(renderWith((props: PillProps) => HostPill(props)));
    expect(warn).not.toHaveBeenCalled();
  });
});
