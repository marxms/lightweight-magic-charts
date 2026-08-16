# React workspace

Why the workspace composition and its regions are shaped the way they are.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## react/workspace/CanvasRow.tsx

### One measured residual

The canvas row sizes the rail, the chart and the grid against ONE measured residual, so the three
end at the same line.

A residual that cannot hold a chart is REPORTED, never drawn at the layout floor. Drawing at the
floor would produce a chart-shaped thing in a space that cannot hold one, and nobody downstream
would learn that the budget was wrong.

Two numbers govern the sizing:

- `MIN_SURFACE_PX = 160` is the floor the canvas refuses to go under, so a short column shows a
  chart and not slivers.
- `FIRST_GUESS_CHROME_PX = 74` is the first frame's guess, and only it: from the first real
  measurement it is never read again. It exists so the first paint is approximately right rather
  than zero-height, not as a fallback that could linger.

`degenerate` is `residual <= 0`, and in that state the children are not rendered at all — the row
reports and draws nothing.

The props:

- `heightPx` — the whole column's budget, chrome included. Never the viewport.
- `onLayout` — where a residual that cannot hold a chart is reported.
- `children` — the three children, each built against the residual this row measured.

### The layout report is held by reference

`onLayout` is kept in a ref (`report.current = onLayout`) rather than being read from props inside
the effect.

By reference, because a host writing the report inline hands over a new function on every render.
Put that function in the effect's dependency array and the effect re-arms every render, which turns
one degenerate-layout report into an unbounded stream of them.

## react/workspace/ChartWorkspace.tsx

### What lives in the composition because no region may own it

`ChartWorkspace` is the only component this package publishes that renders a whole workspace.

INVARIANT: the providers sit above everything the workspace renders, so a region reads chrome,
setup, patterns and the drawing seam from CONTEXT and declares none of them as a prop.

Three things live in the composition because no region may own them:

- The ERROR CHANNEL, written from six places, whose failure is indistinguishable from the failure
  of whoever wrote to it.
- The KEYMAP, which drives an operation two regions read.
- The TABPANEL's ARIA pair, whose other half is minted by the tab strip.

A region owning any of the three would leave the others reaching sideways for it.

### Props grouped by subject

Props are grouped by subject (`data`, `layout`, `chrome`, `studies`, `drawing`, `tabs`), never
listed flat.

This is the same discipline that took the surface from TWENTY-EIGHT names to NINE.

### The data seam carries what the package cannot compute

`WorkspaceDataSource` is the data seam: where the bars come from, which market they are, and how a
chart is made.

It ALSO carries what the seam produced that this package cannot compute — the field behind the
price action (`density`), the marks on it (`marks`), and the account of what the load delivered
(`report`).

All three are the host's vocabulary: which grid a slice describes, which shape is a pattern, and
what counts as coverage are questions about somebody else's data, and a default written here would
be this package having an opinion about it.

The individual fields carry their own notes in code. Two worth repeating:

- `engine` is how to make a chart — the one value the port cannot carry (see `port/chartApi.ts`).
- `venue` and `market` are the other two scope coordinates, and empty is a legitimate answer for a
  host that has only one.

### Why resolve is a function

`WorkspaceStudies.resolve` is resolved by the HOST on demand, from the list this package owns and
the window it seeded.

It is a function for the reason `read` is one: the catalogue is AUTHORIAL and never crosses the
boundary, while the chosen list and the bars are this package's.

Answering the whole `SourceResolution` rather than the views alone is what lets a lane wear its
study's name and draw its numbers without the host being told the list through a second channel.

`views` is the alternative for a composition that holds the list somewhere else and resolved it
once.

### One hoisted empty of each kind

`NONE`, `NO_GROUP`, `NO_TOOLS` and `NO_READINGS` are hoisted module constants.

Hoisted because a literal written inline is a NEW IDENTITY per render, and the chrome provider
watches exactly that.

Shared because an empty list carries no type information worth repeating: `never` is assignable to
every element type, so ONE declaration answers for all of them.

`DEFAULT_STUDY_CAPACITY` is 6. `DEFAULT_CONVENTION` is the Western reading (green up, red down); a
host reading red-is-up hands over its own.

### The shell is a stripped fieldset

`SHELL` is the overlay anchor: the studies menu positions against THIS box, never against the
viewport.

It is a `fieldset`, stripped of the chrome the platform paints — including `min-inline-size`, whose
`min-content` default is what stops a fieldset from shrinking inside a flex parent. Omit that one
reset and the workspace refuses to narrow below its widest child.

### The body is one piece

`WorkspaceBody` is everything below the providers, in one piece, because the ARIA pair, the keymap
and the notice all read the same contexts and all sit outside every region.

Splitting it would mean either duplicating those three or passing them down as props, which is the
prop-count problem the grouping above exists to avoid.

### The keymap is container scoped

The keymap is the CONTAINER's, and the container's alone.

A window listener fires for a chart nobody is looking at, and for a chart on a page that has three
of them. So the root `fieldset` takes `tabIndex={-1}` — focusable so the container receives the
keys it scopes, and out of the tab order so it does not become a stop of its own.

Escape behaviour is conditional on purpose: with a tool armed, escape cancels the TOOL and the
event is stopped; without one the event is left to BUBBLE, so the host's own dismissal still works.

`isTextEntry` guards Delete and Backspace: editing keys are never hijacked from a field somebody is
typing in (`INPUT`, `TEXTAREA`, or any `contentEditable` element).

### Alerts cross regions

The user's own price levels and the window they are judged against BOTH cross regions — the header
mints a level, the canvas drags it, the footer reads what fired — so neither may live in any one of
them. `usePriceAlerts` is therefore held in the body.

### The tip fills the bar in progress

The tip fills the bar in progress, which is precisely the bar history has no reading for.

A lane's numbers come from the RESOLUTION rather than from a host asked for a series it never
named: `read` prefers `resolved.readings`, falls back to the host's `read`, and folds the tip over
whichever answered.

### Reduced outside the updater

`reduceTabs` is called OUTSIDE the state updater, deliberately: an updater has to be pure, and the
refusal below is the one place this composition learns something by comparing the answer with what
it asked.

The reducer answers a refused duplication with the SAME state. Reading that is what turns a button
which quietly does nothing into a sentence — the tab-limit notice.

### Labels resolved above the provider

`resolveWorkspaceLabels` is called in `ChartWorkspace` as well as inside the provider, because this
half sits ABOVE the provider it feeds: the tab mint, the two refusals and the three section names
are all said before any hook could read the context.

The chrome group is destructured BEFORE the memo, so the dependencies are those identities and
never the group: a literal written at the call site is a new object per host render.

## react/workspace/CompactGrid.tsx

### A cell is its position

A CELL IS ITS POSITION.

There is no reorder — only a timeframe swap and a removal — so the INDEX is the identity. That is
why `key={index}` is correct here and carries a `biome-ignore` rather than a synthetic id: moving
does not exist, so an index key can never attach state to the wrong row.

The last cell has no remove control (`onRemove` is passed only while `cells.length > 1`): an empty
grid is a mode with nothing in it, which reads as a broken screen rather than as a choice.

The grid renders nothing at all unless the layout mode is `grade` and a market is set.

### The elastic columns ask for the row the same way

The column declares `width: '100%'`, not `flex: 1`, and the difference is the whole defect.

The canvas row holds three members: a rail of fixed width, and two ELASTIC columns — the surface and
this grid — that share what is left. `flex: 1` expands to `1 1 0%`, and a flex basis of zero shrinks
by zero: when the bases overflow the row, the negative free space is handed out in proportion to
each item's base, so a basis-zero item absorbs none of the shrink and keeps the zero it started
from. The surface beside it asks for the whole row (`width: '100%'`), so the row was always
over-subscribed and this column always lost. Measured on the deployed build: grid 0 x 873, surface
1231 of a 1273 px row, with both cells mounted and 1 px wide.

Both elastic members now ask the same way, so the row splits between them — measured 529/529 of a
1100 px row in `example/`. The other half of the mechanism lives in the surface, which had to
declare that it may shrink at all: see `docs/react-surface.md#the-surface-may-shrink-in-both-axes`.
Reverting either half alone puts the grid back at 0 px, which is what
`scripts/layout-probe.mjs` measures.

## react/workspace/DrawingRail.tsx

### The armed tool and the layer sit above the rail

The armed tool and the captured layer sit ABOVE the rail, in a provider, because the rail is not
their only caller: the canvas arms the layer, and the root's keymap deletes a selection.

A one-region owner would leave those two reaching sideways for it.

The vocabulary is INJECTED — this package names no tool and detects none — and it is taken FROM the
toolbar's own declaration (`Pick<DrawingToolbarProps, ...>`), so the two cannot drift apart on the
next tool added. `shortcuts` maps `event.code` to a tool id for the root's keymap; the rail itself
never reads it.

With no `binding`, the rail still draws and every control on it is inert.

### Market and delete teller through refs

`market` and `onDeleteSelection` are read through refs, never through dependencies.

The binding is rebuilt only when the HOST's own binding changes, and the canvas tears the layer
down whenever it does. Putting the market in the dependency array would rebuild the binding on
every market switch and destroy a layer the canvas still holds.

### The market at birth

The memory is keyed by the market at BIRTH of the layer (`marketRef.current` read inside the
binding), not by the current one.

Switching market mid-session must not file one market's drawings under another's name. Replaying
anchors over another market draws noise.

### The live layer before the snapshot

What is restored is `memory.live?.serialize?.() ?? memory.snapshot` — the LIVE layer before the
snapshot.

Closing a full-screen instance mounts the embedded one while the old is still alive, and its
snapshot has not been taken yet. Reading the snapshot first would restore the state from before the
full-screen session and silently discard everything drawn during it.

On detach the snapshot is taken, and the live and layer handles are cleared only if they still
point at this layer.

### The rail throws outside its provider

`useDrawingRail` throws outside `DrawingRailProvider` rather than returning a filled default.

A filled default would make every drawing control look BROKEN instead of look UNMOUNTED — the
control would be there, respond to a press, and do nothing.

## react/workspace/IntervalRegion.tsx

### Why a region and not a row of chips

The interval is a SETUP field, so its writer belongs on the setup channel every other region writes
through, and the tab that owns the setup owns the interval with it.

That is what makes switching tabs restore the interval the tab was left on, without a line of tab
code in this file.

A row of chips in the header would have had to hold the interval itself, and the tab would then
have needed to reach into the header to restore it.

### The same fallback

The host is told SEPARATELY from the write (`write({ timeframe })` then `onRequest?.(timeframe)`).

Re-scoping what is drawn is this package's job; what else a consumer scopes by the interval — its
own feeds, its own screens — is not knowable here, so it is ANNOUNCED rather than assumed.

The active chip uses `saved ?? options[0] ?? ''`, which is the SAME fallback the composition reads
by, and it has to be: a chip pressed against one rule while the canvas draws by another is a
control that LIES about the chart beside it.

`options` is what this build serves, and the first entry is the answer when the tab states no
preference.

## react/workspace/PaneListSection.tsx

### Zero props by contract

ZERO PROPS, BY CONTRACT. The section is delivered as a section BODY and a body is rendered as
`<Body />`, so what it shows comes from the setup and what it changes goes back through the same
door.

### Drag is the pointer shortcut and the arrows are the keyboard path

Both, never one.

A list that only reorders by drag cannot be reordered without a mouse. The arrows alone make moving
a pane across a long list a click per position.

The drag glyph is decoration and carries `aria-hidden="true"`: whoever has no mouse reorders by the
arrows, so this glyph must not be announced as one more control.

The arrow labels are built per pane (`text.up(named)`, `text.down(named)`) because "Move up" alone
does not say up WHAT, and there is a pair of these per pane.

`onDragOver` calls `preventDefault()` — without it the browser refuses the drop and `onDrop` never
runs at all.

### Rows are named by the catalogue title

Rows are named by the catalogue's TITLE, and by the identifier only when the catalogue named none
(`pane.title ?? pane.id`).

The title is authorial vocabulary and this package still invents none — it arrives on the catalogue
entry and travels on the reconciled pane, which is the channel that did not exist while every row
here read `price` on a screen that says Price.

### The guard against a stale drop

`reordered` returns the SAME list when the move has nowhere to land
(`from < 0 || to < 0 || to >= panes.length || from === to`).

The guard is what keeps a drop from an id this tab no longer holds — a stale payload, a drag that
began in another workspace — from splicing at position minus one and scrambling the order.

The drop reads `dragging ?? event.dataTransfer.getData('text/plain')`: the state is the reliable
half, and the payload is the fallback for a drag the browser reports without one. Firefox refuses
to start a drag at all unless something was written to the transfer.

### A real fieldset

Both the list and each row are REAL `fieldset` elements, like the density controls next door.

A named set of controls is what the element MEANS, and a `div` wearing the role would announce the
same thing with more to write. `BARE_SET` strips the border, margin and padding the platform paints
by default.

## react/workspace/PatternChipsSection.tsx

### The active set is session state

The active set is SESSION state and lives in this region, not in the tab.

A tab describes a CONFIGURATION — timeframe, panes, studies, overlays — and marking a pattern is
something someone is doing while LOOKING, so it neither travels with a tab nor comes back on a
return to one.

### Which patterns exist belongs to the host

Which patterns exist is the HOST's, and it arrives by its own provider rather than by a prop: a
section body is rendered as `<Body />`, so a channel is the only way in.

This package names no pattern and detects none — it shows the ones it is given and reports which
are on.

A choice carries `label` (the face of the chip — an abbreviation, where the full name would not
fit) and optional `name` (the full name, which becomes the accessible one; absent, the face answers
for both).

The provider memoises on the DESTRUCTURED identities, never on the group: a host writing the list
at the call site hands over a new array each render.

### Reported on mount as well as on change

`onActiveChange` fires on every change AND on mount, so a fresh mount says "nothing marks" instead
of leaving the drawing side holding the set of whoever was here before.

## react/workspace/PrimaryActions.tsx

### One region because they fail together

Auto-fit and the price line are one region because they fail apart from everything else and
together with each other — "the header's two primary actions" — not because they cooperate.

Neither reads the other.

### Clear of the close

`NEW_LEVEL_OFFSET = 1.004`, and a new level is placed clear of the close deliberately.

A level born exactly ON the price is already crossed, so it fires the moment it appears and the
user's first experience of a new line is an alert they did not ask for.

The nudge is RELATIVE because a fixed one is noise on a cheap market and invisible on an expensive
one.

`lastClose === null` means there are no bars, so there is no price to put a line near, and the
control says so by disabling itself rather than inventing a level.

## react/workspace/SeriesMenuRegion.tsx

### Escape cannot be bound to the overlay

The listener is on the `document`, and the reason is where focus is standing.

The moment the panel opens, focus is on the **trigger** — the control that was just clicked — and the
trigger is a *sibling* of the overlay, not a descendant. A `keydown` bound to the overlay would
therefore never fire in the one state every visitor reaches first: opened it, has not moved, presses
Escape. It would appear to work in a test that focuses something inside the panel and nowhere else.

This was not reasoned out in advance. It was measured on the published demo: the panel stayed open
on Escape and went on intercepting clicks, while the `Close` button worked. `FlyoutMenu` had the
handler and this region did not, so the pattern existed in the codebase and this one had missed it.

### Focus goes back to what opened it, captured on the way in

`PillProps` carries no `ref`, deliberately — it is a slot the host may replace, and the public
contract is capped at twelve props. So there is nothing to point at when the panel closes.

Instead the region records `document.activeElement` at the moment it opens and focuses that on
Escape. It is not a weaker substitute for a ref: what opened the panel is exactly what should get
focus back, whether that is the built-in trigger or something the host supplied.

### The container's Escape wins when a tool is armed

`ChartWorkspace` handles Escape too, and cancels an armed drawing tool. Its handler is a React one on
the container and runs before a document listener, calling `stopPropagation` only when a tool is
armed — so with both a tool armed and the panel open, the first Escape cancels the tool and the
second closes the panel. That order is the right one: the armed tool is the more recent intent.

## react/workspace/StatusFooter.tsx

### The footer is a sink

A canvas has NO READABLE CONTENT — no nodes, no text, no focus — so the state is STATED.

This region is a SINK: eviction, pane scale, fired alerts and the coverage report all arrive
FINISHED, and nothing here derives any of them. What it owns is the WORDING and the LIVE REGION.

### The reported fields

Every field of `StatusReading` is reported by whoever computed it, never derived here:

- `paneScale` — `1` means at target. Below it, the panes were shrunk to fit, and the ratio is
  whoever shrank them.
- `evicted` — panes collapsed for want of height, named by whoever collapsed them.
- `firedAlerts` — alerts that fired, named by whoever observed the crossing.
- `report` — the coverage report, ALREADY formatted. It is a sentence, not a structure to render.
- `state` — what the canvas is drawing, in words, composed by whoever knows the panes.
- `id` — the `id` the canvas points at with `aria-describedby`.

### One live region and no per tick reading

There is exactly ONE live region here (`role="status"`), and it holds NO per-tick reading.

A value that changes with every streamed frame would flood the screen reader's queue instead of
informing it. The coverage report sits in a sibling span, outside the live region, for the same
reason.

## react/workspace/SymbolTrigger.tsx

### Why the trigger announces no popup

This package holds no dialog, no portal and no focus trap, so it has nothing to promise.

`aria-haspopup` would tell the reader a surface is COMING that only the host can decide to open.
The trigger states a REQUEST, and what answers it is the host's business.

### Read at press time

The symbol is READ AT PRESS TIME, never captured at mount.

A handler closed over the symbol of the render that installed it hands back YESTERDAY'S MARKET on
every press after the first.

## react/workspace/TabsRegion.tsx

### The ARIA pair is minted by one function

INVARIANT: the panel's `id` and the `aria-labelledby` pointing back at the selected tab are minted
by ONE function, `workspaceTabPanelAria`.

The panel element is rendered by the ROOT composition, which is precisely why the pair may not be
typed there: two hand-written strings drift the moment a prefix changes, and the reader is then
promised a region the tab does not name.

The pair is empty when the index names no tab — the same silence the bar keeps, which marks no tab
selected. Naming the first tab instead would label the panel after something not shown.

### What this region declines to invent

Three things, deliberately: a tab id, a default name, and the coercion of a saved setup.

The first is IMPURE. The other two are the host's vocabulary and the host's payload history. All
three arrive through `TabsRegionNaming`.

`onExport` absent means no export button: the file leaves through the host's platform, never
through here.

### The import crosses the shared gate

The picked file is read HERE and crosses the shared gate (`parseTabsPayload`), so "loads without
loss and stops at the cap" is ONE rule with ONE owner instead of a promise each host repeats.

A payload that does not parse produces `null` and no action is dispatched.

## react/workspace/paneViews.ts

### The two halves are not the same kind of pane

The authored panes and the study lanes are NOT the same kind of pane, and that is why they are
assembled together here instead of being concatenated by whoever happened to need both.

- An AUTHORED pane is switched on and off by the user and its visibility is STORED.
- A LANE is switched on by a study OCCUPYING it and its visibility is DERIVED on every resolution.

While those two facts lived apart, an indicator that left by a path which did not clear a stored
switch left an EMPTY PANE on screen.

### Every lane stays in the list

EVERY LANE STAYS IN THE LIST, collapsed when idle.

Panes and series are created once, at mount ([`render.md`](render.md#creation-once-at-mount)), so
dropping an idle lane from this array would DESTROY it on the chart.

### No default palette

`WorkspaceLanes` is the lane calibration, and it is the CONSUMER's: how many lines a lane can draw
(`plots`) and in what colours (`colors`, cycled by position), plus an optional `heightPx`.

There is no default palette, for the reason the lane minter states: COLOUR BELONGS TO WHOEVER OWNS
THE NUMBERS, and a module that shipped one would be a palette in hiding.

### What the inputs mean

- `specs` — every pane this build offers, drawn or not. The price pane is among them and is never
  listed (see below).
- `panes` — what the active tab says about the authored panes: order, visibility, height.
- `studies` — the studies the host resolved, in list order.
- `labels` — series identity to the plot's title, so the legend names the STUDY and not the lane.
- `capacity` — how many lanes exist. It is the study limit seen from the other side.
- `laneTitle` — the label of last resort for a lane nothing occupies.
- `LANE_FORMAT` — a lane plots a signed reading against its own axis, so two decimals and no unit.

An overlay study draws over the candles, so it lights NO LANE at all and is excluded from the
occupancy map.

### Without the price pane

`authoredViews` omits the price pane, and the omission is the STACK's rule rather than a filter of
taste.

The price is the implicit anchor that receives the residual, and listing it would enter it into the
eviction sort as an ordinary pane. The stack THROWS rather than tolerate it.

### Lanes sort after the authored panes

Lane views take `lastUsedAt = from + lane`, i.e. AFTER every authored pane.

A study just switched on is the most recent thing on screen, so the price floor never evicts the
very pane somebody is looking at.

## react/workspace/setupContext.tsx

### A stable handle never the value

INVARIANT: the context carries a STABLE STORE HANDLE, never the setup value.

A consumer re-renders only when `Object.is` says its own selection changed. Exposing the whole
value would make every consumer re-render on every tab switch, and would zero the prop ceiling for
free.

### Read only mounting throws on write

`onChange` absent means the setup is mounted READ-ONLY, and a region that writes says so by
THROWING.

A silent no-op looks exactly like a control that is broken. The same reasoning governs
`useWorkspaceSetup` and `useWorkspaceSetupWriter`, which throw outside the provider: a filled
default would hide the wrong mounting until the screen looked strange, and a no-op default would
make a live control look broken.

### Written during render and again at commit

`current.current = setup` is written DURING RENDER so a same-frame read sees the prop that just
arrived.

It is written AGAIN in the effect, because the render-time write may belong to a DISCARDED render,
and it is the effect that reaches memoized consumers, which never reconcile through the parent
cascade.

Listeners are copied (`Array.from`) before iterating: one may unsubscribe inside its own
notification.

### The write door reads from a ref

`write` reads `apply.current`, never a captured `onChange`.

A host that rebuilds the callback each render would otherwise churn the handle this whole file
exists to keep still.

### One field per call

There is NO whole-value reader, and the absence is the design: a selector returning a freshly built
object never stabilises, so ONE FIELD PER CALL is the intended shape.

### The write door is a patch

The write door takes a PATCH rather than a value.

A region owns SOME fields of the tab and never the whole of it, so handing it the whole object to
rewrite would let one field's owner overwrite every other.

It is separate from the read door because reading is measured by a fan-out gate and writing is not
the same act.

## react/workspace/usePersistedTabs.ts

### Nothing here touches platform

`WorkspaceStore` is a two-method PORT; whether it lands in `localStorage`, in a profile on a
server, or nowhere at all is the consumer's answer.

That is what keeps every rule in this file exercisable WITHOUT A DOM — and what keeps this package
out of the business of guessing where a user's layout belongs.

Absent a store, the workspace is memory-only and forgets on unmount.

### Read once at mount

READ ONCE, AT MOUNT (via the lazy `useState` initialiser).

A store re-read on any later render would FIGHT the state it seeded, and the loser would be
whichever of the two the user had just edited.

### An unreadable payload is said out loud

A payload that cannot be read is SAID OUT LOUD, not thrown.

A host whose storage was hand-edited would otherwise get a white screen for a layout, which is a
worse answer than the defaults plus a sentence.

Reporting is a CALLBACK rather than a message because the wording belongs to the composition that
owns the channel. `Loaded.degraded` records that a payload existed and could not be read — seeding
silently over it would hide the loss.

### An earlier format may decline

`VERSION = 1` is the format number written on the way out and demanded on the way in. `version` is
an override, only to share a number with a payload history this package cannot know.

`migrate` is offered every payload whose version is NOT the current one. Answering `null` means
"not my format", and the payload DEGRADES instead of being misread.

`onExport` absent means no export button. The file leaves through the host's platform, never
through here — the same rule the tab strip states in
[what this region declines to invent](#what-this-region-declines-to-invent).

### The unreadable report is held by reference

`onUnreadable` is kept in a ref: a composition writing the report inline hands over a new function
every render, and the effect that reports would re-arm on each one.

### A refused edit is not a change

The reducer answers a refused edit with the SAME state, and a REFUSAL IS NOT A CHANGE.

Writing anyway would persist on every blur of an untouched rename field. So `set` returns early on
`next === state`, before both `setState` and the store write.

## react/workspace/usePriceAlerts.ts

### One owner for the levels and the firings

ONE OWNER, because a level is minted in the header, dragged on the canvas and read out in the
footer.

Splitting the record of what fired from the list that fired it leaves half of one event somewhere
nobody reads.

The host hears the crossing RAW and the footer hears it as TEXT — a consumer sounding a bell needs
the level and the side, not a sentence.

`FIRINGS_KEPT = 4`: a status line is read at a glance, so it keeps the last few firings rather than
all of them.

The two reported halves:

- `onLevels` — a drag finished: the levels the canvas now holds, and this list is the record of
  them.
- `fired` — what fired, most recent last, ready to be read out.

### The crossing teller is held by reference

`told` is kept in a ref, like the canvas holds its own reporter: the observation runs inside an
effect keyed on `onCrossed`, and a host writing the callback inline would re-arm it every render.

### Functional updates

`addLevel` and `onCrossed` both use the functional updater form.

A level added from a lagging closure would drop the one before it — two levels minted in the same
frame would collapse into one.

### The instrument can change under a live layer

The surface mounts once. Changing symbol does not remount it — the same chart is handed new bars.

That makes the drawing layer outlive the instrument it was born on, and measured, the consequence was
real: one layer served both markets, so the drawings of the market the user left stayed on screen,
anchored at prices that no longer existed in the window.

So the rail watches the market key. On a change it files the live layer's snapshot under the market
being left, clears the layer, and restores whatever the arriving market had. Filing before clearing is
the half that a plain "wipe on switch" gets wrong: coming back has to return the drawings, not an
empty chart.

The detach path files under the market at that MOMENT, not the one at birth, for the same reason.
