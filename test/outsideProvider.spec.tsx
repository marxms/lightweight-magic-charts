/**
 * @jest-environment jsdom
 *
 * The throw path four contexts share, and which none of them had a test for.
 *
 * Three suites already render a hook outside its provider and match a FRAGMENT — `/provider/i` in
 * `chromeContext.spec.tsx`, `/outside WorkspaceSetupProvider/` in `workspaceSetupContext.spec.tsx` —
 * and `useDrawingRail` had nothing at all. A fragment cannot tell one sentence from four, which is
 * the property this collapse is asked to preserve: one factory, four call sites, no copy.
 *
 * It matters more from here on. `useWorkspaceSetup` and `useWorkspaceSetupWriter` are published to
 * hosts, which turns this throw from a private invariant into the message a host developer reads
 * the first time they mount a `WorkspaceSection.Body` in the wrong place.
 */
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';

import { useWorkspaceChrome } from '../src/react/chrome/ChromeContext';
import { outsideProvider } from '../src/react/chrome/labels';
import { useDrawingRail } from '../src/react/workspace/DrawingRail';
import { useWorkspaceSetup, useWorkspaceSetupWriter } from '../src/react/workspace/setupContext';
import { collectSources } from './gates/sourceScan';
import type { Source } from './gates/sourceScan';
import { join } from 'path';

interface Orphan {
  readonly hook: string;
  readonly provider: string;
  readonly Probe: () => ReactElement;
}

/** One entry per context that owns a door. Each probe calls the hook with no provider above it. */
const ORPHANS: readonly Orphan[] = [
  {
    hook: 'useWorkspaceSetup',
    provider: 'WorkspaceSetupProvider',
    Probe: function SetupOrphan(): ReactElement {
      useWorkspaceSetup((setup) => setup.timeframe);
      return <span />;
    },
  },
  {
    hook: 'useWorkspaceSetupWriter',
    provider: 'WorkspaceSetupProvider',
    Probe: function WriterOrphan(): ReactElement {
      useWorkspaceSetupWriter();
      return <span />;
    },
  },
  {
    hook: 'useDrawingRail',
    provider: 'DrawingRailProvider',
    Probe: function RailOrphan(): ReactElement {
      useDrawingRail();
      return <span />;
    },
  },
  {
    hook: 'useWorkspaceChrome',
    provider: 'WorkspaceChromeProvider',
    Probe: function ChromeOrphan(): ReactElement {
      useWorkspaceChrome();
      return <span />;
    },
  },
];

/** React logs the failed render before rethrowing; the noise is not the subject under test. */
function messageOf(Probe: () => ReactElement): string {
  const noise = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    render(<Probe />);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    noise.mockRestore();
  }
  return 'the probe rendered without throwing';
}

const PHRASE = 'was called outside';

const occurrences = (list: readonly Source[]): number =>
  list.reduce((total, source) => total + source.text.split(PHRASE).length - 1, 0);

describe('a hook mounted outside its provider', () => {
  it.each(ORPHANS)('names $hook and $provider, and nothing else', ({ hook, provider, Probe }) => {
    expect(messageOf(Probe)).toBe(outsideProvider(hook, provider));
  });

  it('says which hook and which provider — a constant sentence would name neither', () => {
    // The equality above is satisfied by a factory that ignores both arguments and returns one
    // fixed string, because the call sites would then agree on that string too. This is the clause
    // that refuses it: the two names are IN the sentence, and two different pairs do not collide.
    const message = outsideProvider('useWorkspaceSetup', 'WorkspaceSetupProvider');
    expect(message).toContain('useWorkspaceSetup');
    expect(message).toContain('WorkspaceSetupProvider');
    expect(outsideProvider('a', 'b')).not.toBe(outsideProvider('c', 'd'));
  });

  it('is written ONCE in src — four call sites, one sentence', () => {
    const sources = collectSources(join(__dirname, '..', 'src'));
    expect(occurrences(sources)).toBe(1);

    // POSITIVE CONTROL, in both directions, through the very counter that just judged `src/`. An
    // absence asserted by a scan that matches nothing passes over a reintroduced copy too.
    expect(occurrences([{ file: 'a.ts', text: `x ${PHRASE} y\nz ${PHRASE} w` }])).toBe(2);
    expect(occurrences([{ file: 'a.ts', text: 'nothing to report here' }])).toBe(0);
  });
});
