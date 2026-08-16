/**
 * Box, Row, Column and Text — the primitives the host does NOT replace.
 * See docs/explanation/react-chrome.md#primitives-why-they-are-not-roles
 * See docs/explanation/react-chrome.md#primitives-every-colour-comes-from-the-theme-received
 * See docs/explanation/react-chrome.md#primitives-none-of-them-declares-a-focus-ring
 */
import { memo } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

import type { WorkspaceTheme } from '../theme';

export interface BoxProps {
  readonly theme: WorkspaceTheme;
  readonly children?: ReactNode;
  /** The caller's GEOMETRY — margin, size, position. Colour does not come in here.
   * See docs/explanation/react-chrome.md#primitives-the-style-prop-carries-geometry-not-colour */
  readonly style?: CSSProperties;
  readonly testId?: string;
}

/** Chrome surface: the background, the text colour and the family everything else inherits. */
export const Box = memo(function Box({ theme, children, style, testId }: BoxProps): ReactElement {
  return (
    <div
      data-testid={testId}
      style={{
        background: theme.surface,
        color: theme.text,
        fontFamily: theme.fontFamily,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  );
});

/** Pure stacking: no theme, because it paints nothing.
 * See docs/explanation/react-chrome.md#primitives-the-stack-takes-no-theme */
export interface StackProps {
  readonly children?: ReactNode;
  readonly gap?: number;
  /** Alignment on the cross axis. */
  readonly align?: CSSProperties['alignItems'];
  readonly style?: CSSProperties;
  readonly testId?: string;
}

export const Row = memo(function Row({ children, gap, align, style, testId }: StackProps): ReactElement {
  return (
    <div
      data-testid={testId}
      style={{ display: 'flex', flexDirection: 'row', gap, alignItems: align, ...style }}
    >
      {children}
    </div>
  );
});

export const Column = memo(function Column({ children, gap, align, style, testId }: StackProps): ReactElement {
  return (
    <div
      data-testid={testId}
      style={{ display: 'flex', flexDirection: 'column', gap, alignItems: align, ...style }}
    >
      {children}
    </div>
  );
});

export interface TextProps {
  readonly theme: WorkspaceTheme;
  readonly children?: ReactNode;
  readonly size?: number;
  /** Secondary text: the same token, with less visual weight. It is not a new colour. */
  readonly muted?: boolean;
  readonly style?: CSSProperties;
  readonly testId?: string;
}

export const Text = memo(function Text({ theme, children, size, muted, style, testId }: TextProps): ReactElement {
  return (
    <span
      data-testid={testId}
      style={{
        color: theme.text,
        fontFamily: theme.fontFamily,
        fontSize: size,
        opacity: muted === true ? 0.7 : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  );
});
