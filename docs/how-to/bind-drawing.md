# Connect a drawing library

**The question:** I want trend lines and rectangles on the chart. Which drawing library does this
package use?

None. The rail, the tool buttons, the shortcuts, the count and the delete/clear actions are the
library's; the thing that actually draws is yours, and it arrives through `drawing.binding`. Why that
line sits where it does is argued in [`../explanation/drawing.md`](../explanation/drawing.md).

You supply two halves, and they are independent:

| Half | Prop | What it is |
| --- | --- | --- |
| the words | `drawing.vocabulary` | which tools exist, what they are called, which key arms each |
| the behaviour | `drawing.binding` | a function handed the chart and the container; it returns a live layer |

## Step 1 — name the tools

Tool names are vocabulary, so they are yours. `glyph` is the face on the button; `label` is the
accessible name, and it is what a screen reader says.

```ts
import type { DrawingVocabulary } from 'lightweight-magic-charts';

export const VOCABULARY: DrawingVocabulary = {
  tools: [
    { id: 'trend-line', label: 'Trend line', glyph: '╱', shortcut: 't' },
    { id: 'horizontal', label: 'Horizontal line', glyph: '─', shortcut: 'h' },
    { id: 'rectangle', label: 'Rectangle', glyph: '▭', shortcut: 'r' },
  ],
  shortcuts: { Escape: 'cursor' },
};
```

`tools` is the rail. `allTools` and `toolGroups` are for the "all tools" panel when your set is
larger than a rail should show; leave them out and the panel offers what the rail already does.

## Step 2 — bind the layer

`drawing.binding` is called once per chart with the live handles and must return a `DrawingLayer`.
The library calls `setActiveTool` when a tool is armed or disarmed, `deleteSelection` and `clearAll`
from the rail, and `detach` on unmount — that last one is not optional, and a binding that ignores it
leaks a listener per remount.

The two callbacks in `events` are how the rail learns what happened: `onCountChange` drives the
count on the button, and `onToolFinished` is what disarms the tool after one shape is drawn.

```ts
import type {
  DrawingBinding,
  DrawingLayer,
  DrawingLayerEvents,
  DrawingSurfaceHost,
} from 'lightweight-magic-charts';

/** Stand-in for whatever your drawing package returns. Swap the four calls for its own. */
interface Engine {
  arm: (tool: string | null) => void;
  removeSelected: () => number;
  removeAll: () => void;
  dispose: () => void;
  onFinish: (listener: () => void) => void;
}

declare function createEngine(container: HTMLElement): Engine;

export const binding: DrawingBinding = (
  host: DrawingSurfaceHost,
  events: DrawingLayerEvents,
): DrawingLayer => {
  const engine = createEngine(host.container);
  let drawn = 0;

  engine.onFinish(() => {
    drawn += 1;
    events.onCountChange(drawn);
    // Disarm after one shape. Leave this out and the tool stays armed, which is a real choice —
    // but it is YOUR choice, and the rail will keep showing the tool as active either way.
    events.onToolFinished();
  });

  return {
    setActiveTool: (toolId: string | null) => engine.arm(toolId),
    deleteSelection: () => {
      drawn -= engine.removeSelected();
      events.onCountChange(drawn);
    },
    clearAll: () => {
      engine.removeAll();
      drawn = 0;
      events.onCountChange(drawn);
    },
    detach: () => engine.dispose(),
  };
};
```

`host` carries three things: `chart` (the workspace's handle on the chart), `series` (the price
series, for coordinate conversion) and `container` (the element to draw into).

## Step 3 — keep the drawings across a redraw

`serialize` and `restore` are optional, and the moment they are absent every drawing dies on a
timeframe change. Implement them as a pair or not at all: the snapshot is `unknown` to this package,
which never inspects it and only hands it back.

```ts
import type { DrawingLayer, DrawingSnapshot } from 'lightweight-magic-charts';

declare const engine: { readonly save: () => unknown; readonly load: (state: unknown) => void };
declare const layer: DrawingLayer;

export const persistent: DrawingLayer = {
  ...layer,
  serialize: (): DrawingSnapshot => engine.save(),
  restore: (state: DrawingSnapshot) => engine.load(state),
};
```

## Step 4 — mount it

```tsx
import type { ChartWorkspaceProps } from 'lightweight-magic-charts';

declare const VOCABULARY: NonNullable<ChartWorkspaceProps['drawing']>['vocabulary'];
declare const binding: NonNullable<ChartWorkspaceProps['drawing']>['binding'];

/** HOISTED to module scope: a fresh object per render re-binds the layer on every keystroke. */
export const DRAWING: ChartWorkspaceProps['drawing'] = {
  vocabulary: VOCABULARY,
  binding,
  onDeleteSelection: () => undefined,
};
```

Then `<ChartWorkspace … drawing={DRAWING} />`.

## What breaks if you skip a piece

- **No `binding`** — the rail still renders and the buttons still arm; nothing draws. Useful while
  you are building the vocabulary, misleading if you ship it.
- **No `detach`** — the type requires it, so this is a runtime omission rather than a compile error
  only if you cast. Each remount leaves the previous layer listening.
- **No `serialize`/`restore`** — drawings vanish on a timeframe change. The library does not warn,
  because a binding that genuinely holds nothing is legitimate.
