/**
 * State to ARIA, once, for every chrome role that carries state.
 * See docs/explanation/react-chrome.md#chromestate-action-emits-nothing-and-the-switch-stays-exhaustive
 * See docs/explanation/react-chrome.md#chromestate-aria-controls-rides-only-with-menu
 */
import type { ChromeState } from './slots';

/** "Lit" is a painting question, and each state shape answers it its own way. */
export function isActive(state: ChromeState | undefined): boolean {
  switch (state?.kind) {
    case 'toggle':
      return state.pressed;
    case 'radio':
      return state.checked;
    case 'menu':
      return state.expanded;
    default:
      return false;
  }
}

export function stateAttributes(
  state: ChromeState | undefined,
  controls?: string,
): Record<string, string | undefined> {
  if (state === undefined) return {};
  switch (state.kind) {
    case 'toggle':
      return { 'aria-pressed': String(state.pressed) };
    case 'radio':
      return { role: 'radio', 'aria-checked': String(state.checked) };
    case 'menu':
      return {
        'aria-haspopup': 'menu',
        'aria-expanded': String(state.expanded),
        'aria-controls': controls,
      };
    default:
      return {};
  }
}
