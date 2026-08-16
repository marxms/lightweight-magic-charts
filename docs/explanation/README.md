# Why it is built this way

This directory holds the long-form reasoning behind `lightweight-magic-charts`. It is not a tutorial
and not an API reference: it is the record of what was measured, which alternatives were tried and
knocked down, and which defect each shape exists to prevent.

**It exists because deleting that reasoning is expensive.** The source used to carry it inline — at
one point a file held five lines of code under thirty-seven of prose — and the honest fix was never
to delete the prose. A comment that records a rejected alternative is what stops the next person from
re-introducing it; erase it and the mistake comes back with a fresh commit message. So the argument
moved here and the code kept one line and a pointer.

## How to read it

Every source file that had reasoning to move has a `## <path>` section in the document for its
directory, and each argument sits under a `### <subject>` heading beneath it. The code points at
those headings directly:

```ts
/** Applies a layout to the panes. See docs/explanation/layout.md#deterministic-eviction-order */
```

Two gates keep that arrangement honest, and both fail the build rather than warn:

- **the comment budget** holds `src/` at or under `0.20` comment lines per line of code, and lets no
  single file past `1.0` — because the distribution, not the average, was the defect;
- **the dangling-reference gate** resolves every `docs/<file>.md#<anchor>` written in `src/` against
  the real file and the real heading, and refuses any pointer into a plan this repository archived.
  A pointer that leads nowhere costs the reader a search and pays them with nothing.

## The documents

| Document | Covers |
| --- | --- |
| [`domain.md`](domain.md) | the vocabulary: readings, formats, the types the public surface speaks |
| [`port.md`](port.md) | the data seam — the chart port, frames, the scope machine, seeding |
| [`layout.md`](layout.md) | the height budget, the pane boxes, the legend model |
| [`pane.md`](pane.md) | the pane budget and what it refuses to do |
| [`render.md`](render.md) | the pane stack, the series factory, the overlay bridge |
| [`overlays.md`](overlays.md) | the density field and the trough profile, and their tuning |
| [`indicator.md`](indicator.md) | availability, resolution, coverage and the live tip |
| [`catalogue.md`](catalogue.md) | how a host declares panes, lanes, sources and direction |
| [`tabs.md`](tabs.md) | the tab codec, the setup and the workspace tab set |
| [`alerts.md`](alerts.md) | price alerts and the crossing rule |
| [`drawing.md`](drawing.md) | the drawing layer and its memory |
| [`extension.md`](extension.md) | the plugin seam, and the registry that was rejected |
| [`react.md`](react.md) | the standalone controls: menus, toolbars, chips, legends |
| [`react-chrome.md`](react-chrome.md) | the five overridable chrome roles and the label channel |
| [`react-surface.md`](react-surface.md) | mounting, tearing down and feeding the chart surface |
| [`react-workspace.md`](react-workspace.md) | the composed drop-in and the regions it assembles |
| [`entry.md`](entry.md) | what the public entry point exports, and what it deliberately does not |
| [`ownership-and-licensing.md`](ownership-and-licensing.md) | who owns what, the licence position, and the gate behind each claim |

## The house rule

If you move reasoning out of a comment, it lands here — with the numbers intact, the rejected
alternatives named, and the defect it prevents stated. Trimming is not deleting.
