/**
 * The chrome's write-once context — theme, the five resolved roles, labels and sections.
 * See docs/explanation/react-chrome.md#chromecontext-why-context-and-not-a-prop
 * See docs/explanation/react-chrome.md#chromecontext-the-three-identity-disciplines
 */
import { createContext, memo, useContext, useEffect, useMemo, useRef } from 'react';
import type { ComponentType, ReactElement, ReactNode } from 'react';

import { DEFAULT_WORKSPACE_THEME } from '../theme';
import type { WorkspaceTheme } from '../theme';
import { IconButton } from './IconButton';
import { Notice } from './Notice';
import { Pill } from './Pill';
import { Toggle } from './Toggle';
import { Tooltip } from './Tooltip';
import { resolveWorkspaceLabels } from './labels';
import type { WorkspaceChromeLabels, WorkspaceLabelOverrides } from './labels';
import type { WorkspaceComponents } from './slots';

/** How long the sensor waits before repeating a churn warning. */
const CHURN_THROTTLE_MS = 5_000;

const DEFAULT_TEST_ID_PREFIX = 'workspace';

/**
 * The host's own content region. `Body` is a component TYPE, not an already-captured tree.
 * See docs/explanation/react-chrome.md#chromecontext-body-is-a-component-type
 */
export interface WorkspaceSection {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly Body: ComponentType;
  readonly placement?: 'rail' | 'header' | 'footer';
}

export interface WorkspaceChromeValue {
  readonly theme: WorkspaceTheme;
  readonly components: Required<WorkspaceComponents>;
  readonly labels: WorkspaceChromeLabels;
  readonly sections: readonly WorkspaceSection[];
  readonly testIdPrefix: string;
}

export interface WorkspaceChromeProviderProps {
  readonly children: ReactNode;
  readonly theme?: WorkspaceTheme;
  readonly components?: WorkspaceComponents;
  readonly labels?: WorkspaceLabelOverrides;
  /** The locale the contract formats against. Absent means the runtime's own. */
  readonly locale?: string;
  readonly sections?: readonly WorkspaceSection[];
  readonly testIdPrefix?: string;
}

/** Hoisted. See docs/explanation/react-chrome.md#chromecontext-hoisted-empty-constants */
const NO_COMPONENTS: WorkspaceComponents = {};
const NO_SECTIONS: readonly WorkspaceSection[] = [];

const WorkspaceChromeContext = createContext<WorkspaceChromeValue | null>(null);

/** A stable number per component, so a body can enter a comparable key without being stringified. */
const BODY_KEYS = new WeakMap<ComponentType<unknown>, number>();
let nextBodyKey = 0;
const bodyKey = (Body: ComponentType<unknown>): number => {
  const held = BODY_KEYS.get(Body);
  if (held !== undefined) return held;
  nextBodyKey += 1;
  BODY_KEYS.set(Body, nextBodyKey);
  return nextBodyKey;
};

/**
 * What is WRITE-ONCE about a section: which sections exist, in what order, and which component draws
 * each one. NOT the count — that is live data the composition itself recomputes every time a pane is
 * toggled or a study is chosen, so watching the array identity accused the host of a fault the
 * library was committing on its own.
 * See docs/explanation/react-chrome.md#chromecontext-sections-carry-live-counts
 */
function sectionShape(sections: readonly WorkspaceSection[] | undefined): string {
  return (sections ?? NO_SECTIONS)
    .map((section) => `${section.id}:${bodyKey(section.Body as ComponentType<unknown>)}`)
    .join('\u0000');
}

/**
 * Recurring with rate limiting, never "warn on the first one and go quiet".
 * See docs/explanation/react-chrome.md#chromecontext-the-churn-sensor-repeats
 */
function useIdentityChurnSensor(watched: Readonly<Record<string, unknown>>): void {
  const previous = useRef(watched);
  const lastWarnAt = useRef(0);

  // No dependency array on purpose: what is measured here is the render itself.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const churned = Object.keys(watched).filter((key) => previous.current[key] !== watched[key]);
    previous.current = watched;
    if (churned.length === 0) return;

    const now = Date.now();
    if (now - lastWarnAt.current < CHURN_THROTTLE_MS) return;
    lastWarnAt.current = now;
    console.warn(
      `WorkspaceChromeProvider: the identity of ${churned.join(', ')} changed between renders. ` +
        'Hoist it to module scope or memoize it: a fresh literal per render invalidates the ' +
        'whole context, and the symptom is the panel closing itself and the focus getting lost.',
    );
  });
}

export const WorkspaceChromeProvider = memo(function WorkspaceChromeProvider({
  children,
  theme,
  components,
  labels,
  locale,
  sections,
  testIdPrefix,
}: WorkspaceChromeProviderProps): ReactElement {
  // Destructured BEFORE the memo: these identities are what enter the dependencies, not the object.
  const {
    Pill: pillSlot,
    IconButton: iconButtonSlot,
    Toggle: toggleSlot,
    Tooltip: tooltipSlot,
    Notice: noticeSlot,
  } = components ?? NO_COMPONENTS;

  useIdentityChurnSensor({
    theme,
    Pill: pillSlot,
    IconButton: iconButtonSlot,
    Toggle: toggleSlot,
    Tooltip: tooltipSlot,
    Notice: noticeSlot,
    labels,
    // SECTIONS BY SHAPE, NOT BY ARRAY IDENTITY.
    // See docs/explanation/react-chrome.md#chromecontext-sections-carry-live-counts
    sections: sectionShape(sections),
  });

  const value = useMemo<WorkspaceChromeValue>(
    () => ({
      theme: theme ?? DEFAULT_WORKSPACE_THEME,
      components: {
        Pill: pillSlot ?? Pill,
        IconButton: iconButtonSlot ?? IconButton,
        Toggle: toggleSlot ?? Toggle,
        Tooltip: tooltipSlot ?? Tooltip,
        Notice: noticeSlot ?? Notice,
      },
      labels: resolveWorkspaceLabels(labels, locale),
      sections: sections ?? NO_SECTIONS,
      testIdPrefix: testIdPrefix ?? DEFAULT_TEST_ID_PREFIX,
    }),
    [theme, pillSlot, iconButtonSlot, toggleSlot, tooltipSlot, noticeSlot, labels, locale, sections, testIdPrefix],
  );

  return <WorkspaceChromeContext.Provider value={value}>{children}</WorkspaceChromeContext.Provider>;
});

export function useWorkspaceChrome(): WorkspaceChromeValue {
  const value = useContext(WorkspaceChromeContext);
  if (value === null) {
    throw new Error(
      'useWorkspaceChrome was called outside WorkspaceChromeProvider. Mount the provider above ' +
        'the chrome: a filled default would hide the wrong mount until the screen looks strange.',
    );
  }
  return value;
}

/**
 * The painted tokens alone — defaulted rather than thrown, and ONLY this member.
 * See docs/explanation/react-chrome.md#chromecontext-only-the-theme-has-a-default
 */
export function useChromeTheme(): WorkspaceTheme {
  return useContext(WorkspaceChromeContext)?.theme ?? DEFAULT_WORKSPACE_THEME;
}
