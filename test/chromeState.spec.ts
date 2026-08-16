/**
 * The state-to-ARIA pair, measured directly, now that it exists once instead of twice.
 */
import { isActive, stateAttributes } from '../src/react/chrome/chromeState';

describe('isActive', () => {
  it('answers per state shape, and an action is never lit', () => {
    expect(isActive({ kind: 'toggle', pressed: true })).toBe(true);
    expect(isActive({ kind: 'toggle', pressed: false })).toBe(false);
    expect(isActive({ kind: 'radio', checked: true })).toBe(true);
    expect(isActive({ kind: 'radio', checked: false })).toBe(false);
    expect(isActive({ kind: 'menu', expanded: true })).toBe(true);
    expect(isActive({ kind: 'menu', expanded: false })).toBe(false);
    expect(isActive({ kind: 'action' })).toBe(false);
    expect(isActive(undefined)).toBe(false);
  });
});

describe('stateAttributes', () => {
  it('emits nothing for an action, so no invented on/off reaches the reader', () => {
    expect(stateAttributes({ kind: 'action' })).toEqual({});
    expect(stateAttributes(undefined)).toEqual({});
    // The role that carries no state at all must not gain one from the shared mapping.
    expect(stateAttributes({ kind: 'action' }, 'panel-1')).toEqual({});
  });

  it('maps each stateful shape to its own attribute, never to aria-pressed for all', () => {
    expect(stateAttributes({ kind: 'toggle', pressed: true })).toEqual({ 'aria-pressed': 'true' });
    expect(stateAttributes({ kind: 'radio', checked: false })).toEqual({
      role: 'radio',
      'aria-checked': 'false',
    });
  });

  it('rides aria-controls with menu and with nothing else', () => {
    expect(stateAttributes({ kind: 'menu', expanded: true }, 'panel-1')).toEqual({
      'aria-haspopup': 'menu',
      'aria-expanded': 'true',
      'aria-controls': 'panel-1',
    });
    // Without a panel id the attribute is absent rather than pointing at nothing.
    expect(stateAttributes({ kind: 'menu', expanded: false })['aria-controls']).toBeUndefined();
    expect(stateAttributes({ kind: 'toggle', pressed: true }, 'panel-1')['aria-controls']).toBeUndefined();
    expect(stateAttributes({ kind: 'radio', checked: true }, 'panel-1')['aria-controls']).toBeUndefined();
  });
});
