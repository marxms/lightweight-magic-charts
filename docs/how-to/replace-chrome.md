# Make the controls look like your product

**The question:** the chips and buttons are not my design system. How do I replace them — and do I
have to replace all of them?

No. `chrome.components` takes each of the five roles **independently**: name the two you care about
and the other three stay on the built-in. Partial is the normal case, not a fallback. Why there are
five roles rather than fifty components is argued in
[`../explanation/react-chrome.md`](../explanation/react-chrome.md).

| Role | What it is | The obligation you take on |
| --- | --- | --- |
| `Pill` | chip with visible text — the highest-traffic role | a native `button`, and `state` mapped to the right ARIA |
| `IconButton` | glyph-only control | `label` is required *in the type* — put it on the accessible name **and** on `title` |
| `Toggle` | a binary in widget form | `role="switch"` with `aria-checked`, never `aria-pressed` |
| `Tooltip` | rich tooltip over one trigger | the panel *describes*: wire `aria-describedby`, close on Escape |
| `Notice` | the only error surface, and the only live region | `severity` decides insistence; honour `onDismiss` |

## Step 1 — replace two roles, keep three

Annotate the whole `chrome` object and every role you write is typed by inference. The five prop
types are not exported by name — the entry publishes only what has a consumer, and a type reached
through `ChartWorkspaceProps` already is one — so this is the path, not a workaround.

```tsx
import type { ChartWorkspaceProps } from 'lightweight-magic-charts';

/** HOISTED to module scope. A fresh object per render invalidates the whole chrome context. */
export const CHROME: ChartWorkspaceProps['chrome'] = {
  components: {
    Pill: ({ children, state, theme, onSelect, disabled, label, tabIndex }) => (
      <button
        type="button"
        className="brand-pill"
        onClick={onSelect}
        disabled={disabled}
        aria-label={label}
        tabIndex={tabIndex}
        aria-pressed={state.kind === 'toggle' ? state.pressed : undefined}
        aria-checked={state.kind === 'radio' ? state.checked : undefined}
        aria-expanded={state.kind === 'menu' ? state.expanded : undefined}
        style={{ color: theme.text, borderColor: theme.border }}
      >
        {children}
      </button>
    ),
    Toggle: ({ label, checked, onChange, theme, disabled }) => (
      <button
        type="button"
        role="switch"
        className="brand-switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{ background: checked ? theme.accentFill : theme.control }}
      />
    ),
  },
};
```

`IconButton`, `Tooltip` and `Notice` are absent from that object, so they stay on the built-in. Then
mount it: `<ChartWorkspace catalogue={…} data={…} layout={…} chrome={CHROME} />`.

**Hoist it, or memoize it.** `chrome` is context, and context is for what never changes. A new object
literal per render invalidates every consumer, and the symptom is not a warning — it is the panel
closing itself and focus getting lost. A development-only sensor warns when an identity churns, and
it repeats instead of latching. The same rule covers `chrome.theme`, `chrome.labels` and
`chrome.sections`.

## Step 2 — repaint without replacing anything

If the shapes are fine and only the colours are wrong, do not write a role at all. `chrome.theme` is
twelve tokens, and every built-in control paints from them with inline style — no stylesheet to
override, no cascade to fight.

```ts
import { DEFAULT_WORKSPACE_THEME, type ChartWorkspaceProps } from 'lightweight-magic-charts';

export const CHROME: ChartWorkspaceProps['chrome'] = {
  theme: {
    ...DEFAULT_WORKSPACE_THEME,
    background: '#0b0f16',
    surface: '#151b25',
    accent: '#4c8dff',
    accentFill: '#1d3557',
    fontFamily: '"Inter", system-ui, sans-serif',
  },
};
```

## Step 3 — add content, not a control

The sixth extension point is `chrome.sections`, and it is different in kind: it injects a *body*
into the rail, the header or the footer. Use it for the thing that is yours and has no equivalent
role — a positions panel, a risk readout, an account switcher.

```tsx
import type { WorkspaceSection } from 'lightweight-magic-charts';

export const SECTIONS: readonly WorkspaceSection[] = [
  {
    id: 'positions',
    label: 'Open positions',
    count: 2,
    placement: 'rail',
    Body: () => <ol className="brand-positions" />,
  },
];
```

`count` is what the collapsed header shows, so keep it equal to what `Body` renders — the section
header is the only thing a reader sees while it is closed.

## What the type cannot tell you

The type is the weaker half of the contract. A role that spreads `...rest` onto a `div` and drops
`aria-pressed` compiles fine and silently voids a dozen accessibility criteria; in a host written in
plain JavaScript it is not checked at all. The obligations in the table at the top are exactly the
part the type cannot state, and they are the reason to replace two roles rather than five.

Two more things the library keeps whichever roles you bring: focus order and the live region. A
replaced `Notice` still has to honour `severity` — `error` is assertive, everything else polite —
because it is the only surface that announces a failure.

## Where the words come from

Not from your role. Every sentence the composition can say lives in `chrome.labels`, English by
default and overridable member by member; a role receives text through `children` and `label` and
never authors any. To translate the workspace, override the channel, not the controls — see
[`../reference/react/chrome/labels.md`](../reference/react/chrome/labels.md) for the whole contract.
