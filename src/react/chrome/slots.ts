/**
 * The contract of the five chrome roles — what the host may replace, and under what obligations.
 * See docs/explanation/react-chrome.md#slots-why-roles-and-not-components
 * See docs/explanation/react-chrome.md#slots-the-per-member-obligations
 */
import type { ComponentType, ReactElement, ReactNode, Ref } from 'react';

import type { WorkspaceTheme } from '../theme';

/** The state a control carries, as a discriminated union. `action` has no state field. */
export type ChromeState =
  | { readonly kind: 'action' }
  | { readonly kind: 'toggle'; readonly pressed: boolean }
  | { readonly kind: 'radio'; readonly checked: boolean }
  | { readonly kind: 'menu'; readonly expanded: boolean };

/** Chip with visible text — the highest-traffic role. */
export interface PillProps {
  readonly children: ReactNode;
  readonly state: ChromeState;
  readonly theme: WorkspaceTheme;
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly tabIndex?: number;
}

/** Glyph-only control. `label` is required IN THE TYPE, because a glyph is not a name. */
export interface IconButtonProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly theme: WorkspaceTheme;
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
  readonly state?: ChromeState;
  readonly controls?: string;
  readonly tabIndex?: number;
  readonly testId?: string;
  readonly hover?: { readonly onEnter: () => void; readonly onLeave: () => void };
  readonly ref?: Ref<HTMLButtonElement>;
}

/** A binary in widget form: `role="switch"` + `aria-checked`, never `aria-pressed`. */
export interface ToggleProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly theme: WorkspaceTheme;
  readonly disabled?: boolean;
}

export interface TooltipTriggerProps {
  readonly title?: string;
  readonly 'aria-describedby'?: string;
}

/** Rich tooltip, no portal: the panel is a sibling of the trigger inside the same wrapper. */
export interface TooltipProps {
  readonly content: string;
  readonly children: ReactElement<TooltipTriggerProps>;
  readonly theme: WorkspaceTheme;
  readonly disabled?: boolean;
}

export type NoticeSeverity = 'error' | 'warning' | 'info';

/** The library's only error surface, and the only one that carries a live region. */
export interface NoticeProps {
  readonly severity: NoticeSeverity;
  readonly children: ReactNode;
  readonly theme: WorkspaceTheme;
  readonly onDismiss?: () => void;
  readonly dismissLabel?: string;
}

/** The five roles, all optional — and five is the ceiling. */
export interface WorkspaceComponents {
  readonly Pill?: ComponentType<PillProps>;
  readonly IconButton?: ComponentType<IconButtonProps>;
  readonly Toggle?: ComponentType<ToggleProps>;
  readonly Tooltip?: ComponentType<TooltipProps>;
  readonly Notice?: ComponentType<NoticeProps>;
}
