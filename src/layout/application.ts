/**
 * The RESULT of applying the height budget, declared where the arithmetic that produces it lives.
 * See docs/explanation/layout.md#the-budget-result-is-declared-beside-the-budget
 */

import type { PaneId } from '../domain/types';
import type { LayoutOutcome } from './computeLayout';

export interface StackPane {
  readonly id: PaneId;
  readonly targetHeightPx: number;
  readonly lastUsedAt: number;
  readonly visible: boolean;
}

export type StackApplication =
  | {
      readonly kind: 'degenerate';
      readonly totalPx: number;
    }
  | {
      readonly kind: 'applied';
      readonly outcome: LayoutOutcome;
      readonly collapsed: readonly PaneId[];
      readonly order: readonly PaneId[];
      readonly ordered: boolean;
    };
