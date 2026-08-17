# React controls

The reasoning behind the standalone React controls of this package: the menus, the rails, the chips,
the tab strip and the two data bindings. The five replaceable chrome roles are next door, in
[`react-chrome.md`](react-chrome.md).

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## react/DensityControls.tsx

### The inverted gamma slider

The two knobs that make a density field readable, and the one inversion that makes them honest.

`DensityFieldOverlay` has taken a `DensityTuning` since it was written, and nothing could produce
one: the package shipped the mechanism and no control, so in practice every consumer drew the field
at its defaults. `DensityControls` is the missing half.

THE GAMMA SLIDER RUNS BACKWARDS ON PURPOSE. The knob a reader wants is "lift the faint cells", and
dragging right has to mean more of that — but the exponent works the other way round: a LOW gamma is a
STRONG lift. So the control reflects its range onto itself, and the reflection constant is derived
from the bounds rather than typed out, because the two have to agree and only one of them can be the
source.

`reflectGamma` is that reflection: `min + max - value` is its own inverse, so applying it on the way
out and again on the way in is the identity — the stored exponent never drifts by a rounding step per
drag. One decimal is the gamma step, and `onGammaGrid` keeps the reflection on that grid so the
slider stays addressable.

The EXPONENT is shown in the readout, not the slider's reflected position: the reflection is an input
ergonomic, and printing it would leave the reader with a number that appears nowhere else — not in a
saved workspace, not in the ramp.

`DensityControlLabels.readout` formats that exponent beside its slider. `γ` is universal; the
number's shape is not, so the host supplies the formatting.

### Neither knob touches the data

Both knobs are monotonic in the normalised weight, so the ranking of cells is unchanged and moving a
slider is a REPAINT — never a refetch. That is the whole reason they are cheap enough to drag.

### A real fieldset a clipped legend and a wrapping label

Three markup decisions that are invisible in a screenshot:

- A REAL `fieldset`, not a `div role="group"`. Two sliders side by side with no stated relation are
  two unrelated sliders to anything that is not looking at them, and the element that says otherwise
  is the one the platform already has.
- The `legend` is named for a screen reader and clipped for the eye. This control lives in a status
  strip where a visible group heading would cost a row the chart needs. `CLIPPED` is the style that
  makes it available to assistive technology and absent to the eye; `display: none` would remove it
  from both.
- The label WRAPS the input, so the association holds without minting an id — which matters when a
  host renders two workspaces on one page and ids would collide.

`DEFAULT_DENSITY_CONTROL_LABELS` is the same object the whole contract carries. A second copy would
drift on the first edit.

## react/DrawingToolbar.tsx

### Radio not aria-pressed

The drawing rail is one armed tool at a time, in a column of icons.

WHY `radio` AND NOT `aria-pressed`. Arming a tool disarms the previous one — that is mutual exclusion,
and a row of toggle buttons says the opposite: each one reports its own on/off state, so a screen
reader describing the rail says "pressed" once and leaves the reader to infer that the other nine are
related. A radio group states the relationship — and it OWES the reader arrow-key traversal, which a
native radio input would have given for free and this rail has to write.

WHY THERE IS ALWAYS A "NO TOOL" MEMBER. A radio group in which nothing is checked is a broken radio
group, and "no tool armed" is a real, reachable state — it is the state the chart pans in. So the rail
owns that member (`CURSOR_ID`) rather than expecting every host to remember to supply one.

WHY THE SHORTCUT IS IN THE ACCESSIBLE NAME. The visible content of each control is a single glyph,
which is not a name; the label and its shortcut have to reach the accessibility tree some other way,
and the accessible name is that way. `DrawingTool.glyph` is one character or glyph — the visible
content, never the accessible name. `DrawingTool.shortcut` is rendered into the accessible name, for
example `Alt+T`; the host owns the binding itself.

AUTOMATIC ACTIVATION on the rail, as in a native radio group: focus and checking travel together.
Splitting them would let the focused item and the armed item diverge, and then `tabindex` would start
pointing at an item that is not the one the user sees highlighted. The arrow key calls
`event.preventDefault()` only after knowing the key is ours — otherwise the arrow scrolls the rail
out from under focus.

Arrow traversal is the obligation that comes with `role="radiogroup"`, and it lives in
`onRailKeyDown` — the handler sits on the group, not on each button, because the target of the
movement is a SIBLING of whoever received the key.

The delete and clear actions are DISABLED rather than hidden: a rail whose buttons come and go
changes size as the user works, and the control that was under the pointer is suddenly a different
one.

WHAT IS NOT HERE: the drawing itself, the catalogue bucketing (`./drawingToolBuckets`), the panel
(`./chrome/FlyoutMenu`) and the traversal arithmetic (`./chrome/rovingFocus`). What is left is the
rail and the composition — which is everything a rail should have been all along.

`DEFAULT_DRAWING_TOOLBAR_LABELS` is the same object the whole contract carries; a second copy would
drift on the first edit. `DrawingToolbarLabels.allTools` names the single flyout a host gets when it
declares no families at all, `otherTools` names the family of last resort (entries the host did not
group, or grouped under no `toolGroups` id), and `count` takes the count so a host can pluralise in
its own language.

`DrawingToolbarProps.allTools` is everything beyond the curated rail: omitted means no flyout, and an
empty list draws none either. `toolGroups` are the families of `allTools`, in the order the host
wants them; omitted means a single family. `activeToolId` of `null` means nothing armed, which is a
state and not an absence.

### A flyout not another select

WHY A FLYOUT AND NOT ANOTHER `<select>`. The host's entire catalogue (dozens of tools) has to fit in a
rail that costs the chart WIDTH. A `<select>` charges the width of the longest name — closed AND open,
because the native popup inherits the control's width. A flyout reads the name OUTSIDE the rail: the
width goes back to being an icon's, the one axis on which the rail is cheap.

The panel remounts per family (`key={openBucket.id}`): the focus and position effects are born with
the panel, and a family swap reusing the instance would leave focus on the previous family's item.

Only the OPEN family's trigger is registered, by the button itself (`openTriggerRef`) — no map to keep
up to date. It is the only one the panel needs, to measure itself against it and hand focus back to
it.

Pointer and click open the flyout differently. THE POINTER OPENS delayed, otherwise crossing the rail
opens all the panels on the way. A click is an intent ALREADY declared: no waiting on a clock, and no
letting a pending hover schedule reopen what it has just closed.

Closing by POINTER is refused while the keyboard is inside. If focus is on the rail it is because
someone is navigating by keyboard, and a pointer that merely passed nearby cannot interrupt that.

### The open state carries how it happened

The opening carries HOW it happened, and not only what.

`byPointer` decides one thing only — whether focus is moved — and lives in the same state because it
is the same event. In a ref it would have to be read during the render to go down as a prop, which is
exactly the read React does not guarantee.

### The single tab stop of the rail

The group's ONLY TAB STOP, and why it is not always the checked item.

With a catalogue tool armed — picked in the flyout, outside the curated icons — NO item on the rail is
checked. Without the fallback to the first one, the whole group would drop out of the tab order and
be unreachable by keyboard exactly when the user most needs to get back to the cursor.

### Height scrolling and the flyout anchor

`heightPx` is the height of the box the rail lives in — MEASURED by the host, never guessed here.
Omitted, the rail stays the size of its content. Supplied, it takes the whole height and scrolls
inside: without its own scrolling, a tall catalogue would push the host's footer out.

Scrolling is enabled only where there is a height to respect; with no declared height, `auto` would
create a scrollbar over a box that already fits. And only on the VERTICAL axis: on a rail laid flat
the content grows in x, and hiding overflow there would cut buttons off instead of scrolling.

`position: relative` on the root is what anchors the flyout: the panel is a child of THAT box and a
sibling of the scroller, never a child of the scroller — an `overflow-y: auto` clips the popup on
`overflow-x` by CSS rule, and the panel would show up cut in half.

The rail's width is one icon button plus the padding, and nothing else:
`RAIL_WIDTH_PX = GLYPH_WIDTH_PX + RAIL_PADDING_PX * 2 + 2`, with `GLYPH_WIDTH_PX = 28` and
`RAIL_PADDING_PX = 4`.

### Sanitising host ids for the DOM

The family `id` comes from the host and can be anything — including a label with a space in it, which
is an INVALID DOM `id`. An invalid `aria-controls` points at nothing: the reader promises a panel and
does not find it. Sanitising (`domSafe`) is cheaper than demanding of the host a rule it cannot know.

## react/SeriesMenu.tsx

### The menu knows only chosen never where

WHY THE MENU KNOWS ONLY "CHOSEN", AND NEVER WHERE. It used to take a fixed pool of slots and hand back
an assignment, which gave this package a vocabulary belonging to one consumer's model — and a label
("N/M slots", "every slot is taken") that promised the user a numbered place for each study. The
contract is now the generic one it should always have been: which entry ids are currently chosen,
what to do when one is chosen, and an OPTIONAL ceiling that the host — not this menu — is the one to
enforce. Whether a choice adds, removes or replaces is the host's decision; the menu reports the
click and paints the state it was given.

WHAT THE HOST INJECTS: `SeriesProvider` instances, each with a label and a category. This package
never enumerates a catalogue, never imports one, and cannot name an entry in it — which is the same
rule the extension boundary has always had, now visible in the UI layer too.
`SeriesCatalogueEntry.provider` is the instance the host built, handed straight back on assignment so
no lookup table is needed; `hint` is shown on hover and is the host's own words about what this
computes.

`SeriesMenuProps.selected` are the entry ids the host currently holds — it drives the pressed state
and nothing else. `onSelect` is reported, never interpreted: adding, removing or replacing is the
host's decision. `capacity` is a ceiling the HOST enforces, stated here so the user is not left to
discover it by being refused; absent means the host declared none and the menu says nothing about
one. `maxResults` (default 160) bounds the rendered list, because a catalogue of thousands is a
scroll container nobody reads. `onClose`, when present, gives the header the prototype's close
button.

`SeriesMenuProps.sections` are the host's OWN sections, ahead of the catalogue categories on the same
rail. They exist because a navigation bar split across several entry points is a bar the user has to
learn. The host brings the label, the count and the body; the lib only lends the rail, the selection
and the tablist/tabpanel semantics — it still does not know what a section is.

Ids are the host's strings and may hold spaces or accents; a DOM id may not, which is what `domId`
is for.

Entries in the results panel use `aria-pressed`, never `radio`: choosing one entry does not unchoose
another, and a radio group would promise exactly that.

`DEFAULT_SERIES_MENU_LABELS` is the same object the whole contract carries; a second copy would drift
on the first edit.

### The search overrides the rail

WHY THE SEARCH OVERRIDES THE RAIL RATHER THAN FILTERING WITHIN IT. Somebody typing a name does not know
which category it is in — that is why they are typing. A search scoped to the selected category
answers "not found" for something that is right there, which is the worst answer a search can give.
While a query is present no tab is selected, and the results panel says so: the results are not that
tab's contents, and saying they are would be the markup contradicting the panel's own label.

### Hover switches sections except while searching

THE CLICK is declared intent: `pickSection` pins the section at once and drops the search, the other
mode.

THE POINTER is the same switch, delayed — and IGNORED while a search is typed in. With a query in
progress the panel is the search result, and swapping it under the pointer would erase what the user
has just written without them having asked for anything. The search leaves the way it came in:
through the field, or through a click.

### Arrows and one tab stop on the tablist rail

The rail's arrow keys are the promise `role="tablist"` makes and that nobody was keeping.

AUTOMATIC activation (focus switches the section along with it), which is the tablist pattern and what
makes keyboard navigation equivalent to the pointer's instead of a second model to learn. The order
of the targets is read from the DOM, so it cannot diverge from the drawn one. The handler calls
`preventDefault` because otherwise the arrow scrolls the rail out from under the focus.

Arrow-key traversal lives in `onRailKeyDown` — the handler sits on the rail, not on each tab, because
the target of the movement is a SIBLING of whoever received the key.

THE OTHER HALF OF THE PATTERN, which was missing: a rail has ONE tab stop, not one per tab. The arrow
keys already existed and were tested, which made the gap invisible — the rail looked navigable and
charged one Tab per category to be crossed, which is the cost the arrow key exists to remove. With a
search typed in no tab is selected, and then the stop is the first one: without that fallback the
whole rail would leave the tab order while one types.

### The optional close label

`SeriesMenuLabels.close` is the name of the close button. OPTIONAL, unlike the rest, and the reason is
compatibility: `labels` is the WHOLE object, so making this member required would fail compilation for
every host that already assembles the group — and the label was born after them. The default enters by
`??`.

`SeriesMenuLabels.chosenCount` receives `capacity` as `null` when the host declared no ceiling: say
the count and nothing more.

## react/TimeframeChips.tsx

### Theme tokens only and an injected accessible name

The interval control, as the library's own chrome.

INVARIANT: painted from `WorkspaceTheme` tokens only — no `className`, no CSS-in-JS runtime. A host
that adopts this package must not have to resolve a second style runtime for a row of chips.

INVARIANT: the accessible name is INJECTED. What a resolution means to a product is the host's
vocabulary, and this package must not learn it. `describe` names one chip — the face shows the
interval, the name may say more — and `label` names the group.

INVARIANT: exactly one chip holds the tab stop, and with nothing active the first one takes it. A
group with no tab stop is a group the keyboard cannot enter at all.

`nextRovingIndex` returning `null` means the key is not ours, and swallowing it would steal Tab and
the host's shortcuts.

The container is a REAL `fieldset`, the element the platform already has for a named set of controls.

## react/WorkspaceLegend.tsx

### Why a legend overlay exists at all

`IPaneApi` has no legend among its methods and the pane's own element is a table cell that will not
host an absolutely positioned child cleanly. So a stack of nine panes is NINE UNLABELLED STRIPS:
nothing on screen says which one is which, and the right-hand axis — one column shared by every pane's
own scale — reads as a single nonsensical range. The label is not decoration here; it is the only
thing that says what a strip is and what unit its axis carries.

WHY IT IS AN OVERLAY AND NOT A ROW ABOVE EACH PANE. Vertical space is the scarce resource — the host
hands down a fixed budget and every row of chrome is a row the chart loses — so the label sits ON the
pane it names, in its top-left corner, where a charting app puts it.

The overlay sets `pointerEvents: 'none'`: the chart owns every gesture on this area, and a legend
that swallowed the press would kill panning exactly where the user is most likely to start one.

`testIdPrefix` prefixes the per-line test ids, so a host can host two workspaces without a collision.

### Why React renders it

React renders the legend rather than an imperative `innerHTML` write per mousemove (which is what the
prototype does): the values change once per BAR CROSSED, not once per pixel moved, so the render cost
is bounded by the crosshair changing bars — and in exchange the text is real DOM that a test and a
screen reader can both read. The prototype's version also builds its markup by string concatenation,
which makes every series label an injection site; here they are text nodes.

### Where a legend line is declared

WHAT A LEGEND LINE IS gets declared where the DECISION is made, one layer down (`../layout/legendModel`),
and is re-exported here so the public spelling does not move. Two declarations of one shape is how a
producer and a consumer of the same object start disagreeing about it — and the model layer cannot
import this file (it may not look up at React), so the single declaration has to be the lower one.

### Mute entries are filtered out

An entry with no NAME and no VALUE identifies nothing — it is a loose colour swatch. It really
happens: a consumer that reserves series from a pool declares them all at once, and the unassigned
ones arrive here mute. Filtered here and not in the host, because the rule is about what a legend CAN
say, not about what that host reserves.

## react/WorkspaceTabsBar.tsx

### What the bar declares and what it does not

The tab strip over a workspace is presentation only. The set arithmetic lives in
`tabs/workspaceTabs.ts`; this renders whatever list it is handed and reports intents. Two semantics
carried over from the reference implementation, both invisible in a screenshot:

- `role="tablist"` wraps the TABS ONLY. The "+" and the export/import pair are actions of the bar,
  not tabs, and a tablist would declare them as tabs to assistive technology.
- Each tab is a `div` holding two buttons, never a button holding a button: nesting them is invalid
  HTML and the inner close target stops being reachable by keyboard.

The close button on the LAST tab is disabled, not hidden — the reducer refuses the action anyway, and
a control that vanishes changes the bar's geometry under the pointer. Its accessible name matters
too: "Close tab" repeated N times does not say WHICH tab closes, and the × glyph is the button's whole
content, so there is no text for the name to fall back on.

What the members are:

- `WorkspaceTabsBarItem` is what the bar needs to draw one tab; the setup itself never reaches this
  component. `caption` is a small dimmed suffix after the name — the host typically states the tab's
  timeframe.
- `WorkspaceTabsBarLabels.rename` is the accessible name of the rename field. A bare text box says
  nothing about WHICH tab it edits. `renameHint` exists because double click is an invisible
  affordance and the tooltip is the only place it is announced.
- `DEFAULT_WORKSPACE_TABS_BAR_LABELS` is the same object the whole contract carries; a second copy
  would drift on the first edit.
- `panelId` is the id of the tabpanel element the tabs control — the host renders that panel.
- `onExport` / `onImportFile` are omitted together with their buttons when the host wires neither.
  The file input's value is cleared on change so picking the SAME file twice fires change again.
- `workspaceTabButtonId` is the id the host points `aria-labelledby` at from its tabpanel.
- `workspaceTabRenameId` is the rename field's OWN id — never the tab's.

### Renaming by id and never by index

`onRename` is a confirmed new name for a tab. OPTIONAL, and its absence is the whole contract: with no
handler the bar is byte-for-byte the bar of before — no editor, no double-click affordance.

By ID, not by index, unlike every other callback here: an edit session outlives the render it started
in, and a tab closed or imported meanwhile would slide a captured index onto a different tab.
Identity is the only handle that survives that. The same reason drives `editingId` holding an id
rather than an index.

Blank is REFUSED, never "a tab with no name": the previous label still stands, so the host is not told
anything and nothing is written. Same for a name that did not actually change.

When the editor opens, the field is focused and its text selected WHOLE, because renaming is usually
REPLACING. Without the `select()` the caret lands at position 0 and typing prefixes the old name
instead of superseding it. The effect is keyed on the SESSION, not on the draft: re-running per
keystroke would re-select what the user just typed.

### The settled mark that stops a double commit

`settledRef` means "this edit session is already decided".

Enter and Escape both unmount the field, and some browsers fire `blur` on a focused element that
leaves the DOM. Without this mark that trailing blur would run the commit a second time — and, after
Escape, would UNDO the cancel. The blur that matters (the user clicking away) always arrives with the
session still undecided.

### The traversal the role promised

`role="tablist"` promises the screen reader what a native tab list delivers: one tab stop for the
whole list, and arrows to move within it. This bar answered no key at all beyond Tab — every tab was
its own stop, and there was no way to jump from one end to the other. It is the most visible debt on
the entire surface, and the one the suite never touched: no key event was ever simulated against the
list.

MANUAL ACTIVATION, unlike the series menu's rail: the arrow moves the FOCUS and does not switch the
tab. A tab here is a whole workspace setup, and activating on focus would rebuild the chart on every
arrow crossed. Enter and Space activate, for free, because the tab is a real `button`.

`preventDefault` is called only after knowing the key is ours: the bar lives above a rename field and
above a chart that read keys of their own.

The list has ONE tab stop, and it is the active tab. Without that, a bar of eight tabs costs eight
Tabs to cross — the cost the arrow has just removed.

### The field is laid over the tab and never replaces it

Swapping the `<button role="tab">` for an `<input>` draws the same thing and breaks two invisible
contracts at once: the tablist would report N-1 tabs while one label is being edited, and the host's
tabpanel points `aria-labelledby` at this button's id, so the panel would lose its accessible name
mid-edit. Keeping the button mounted (and giving the field an id of its own) keeps both intact, and
as a bonus the tab holds its width — the same reason the close button on the last tab is disabled, not
hidden.

The field covers the LABEL only, so the close button beside it stays reachable. It is opaque: the
button underneath is still painted, and a translucent field would show the old label through the new
one.

### Escape stops here

Escape is STOPPED at the rename field, and this is not decoration. A host that scopes Escape (this
package's own workspace disarms its drawing tool, and lets the key bubble to whatever dismisses its
fullscreen) reads Escape BEFORE it checks whether the target is a text field. Left to bubble,
cancelling a rename would also disarm the tool or collapse the surface around it.

### No outline none on the rename field

The field is born focused and is the one place on the bar where a person types: suppressing the focus
ring here erases the indicator exactly where it matters most. The accent border does not replace it —
that border is the same with and without focus.

## react/drawingToolBuckets.ts

### The leftover family

THE CATALOGUE SPLIT INTO FAMILIES — list arithmetic, no React and no DOM.

THE LEFTOVER FAMILY EXISTS SO THAT GROUPING NEVER COSTS REACH. A category the host's drawing package
gains tomorrow, or an entry it did not categorise, lands there instead of vanishing from the list. It
is the trap this palette's original `<optgroup>` fell into, and that is why the rule has a positive
control of its own in the suite.

THE VOCABULARY IS ALL THE HOST'S. `group` is an opaque string: it is only compared against the `id` of
the declared families, and the content is never read. Whoever knows what Fibonacci is is whoever chose
the drawing package, not the rail.

With no declared family at all, "the others" would be ALL of them — and then the honest name is the
whole catalogue's, which is how this rail behaved before families existed. That is why
`bucketDrawingTools` falls back to `labels.allTools` when `groups` is empty and uses
`labels.otherTools` otherwise.

What the members are:

- `DrawingToolOption` is an entry of the COMPLETE catalogue — all the host's registry has beyond the
  curated rail. `group` is THE FAMILY KEY: absent (or not declared) means no family, and the entry
  stays reachable in the leftover family, because grouping must not cost reach. `shortcut` is shown
  to the right of the name; the host remains the owner of the binding.
- `DrawingToolGroup` is a family DECLARED BY THE HOST: the array's order is the order in the rail.
  `id` is opaque, `label` is what the reader hears, `glyph` is the icon (a character or a glyph — the
  visible content, never the accessible name). All three come from outside because all three are
  domain vocabulary, and this library has none.
- `LEFTOVER_BUCKET_ID` is the `id` of the leftover family. Reserved, hence shaped the way a host would
  not write it.
- `DrawingBucketLabels` is only what the grouping needs to name — the rest of the labels is the
  component's business. `allTools` names the single flyout the host gets when it declares no family
  at all; `otherTools` names the leftover family: what the host did not group, or grouped under an
  undeclared `id`.

### Empty families are not triggers

A declared family that is empty does not become a trigger: a button that opens an empty panel only
spends rail height, which is the one axis on which it is expensive.

## react/hoverIntent.ts

### Why pointer intent is a module

POINTER INTENT is the little bit of time that separates "meant to" from "passed over".

WHY THIS EXISTS AS A MODULE. Two places in this library open a panel under the pointer (the drawing
rail's flyout and the series menu's section rail) and the host opens a third. All three get it wrong
the same way when written by hand: a bare `onMouseEnter` opens EVERY panel the pointer crosses on its
way to the one the user wants, and a bare `onMouseLeave` closes before the pointer has crossed the
one-pixel gap between the trigger and the panel.

WHAT IS NOT HERE: any notion of what is being opened. This module schedules and unschedules; what runs
when the delay is up always belongs to the caller. `HoverIntent.open` schedules with the OPENING
delay and `HoverIntent.close` with the CLOSING one; both replace any pending timer.

HOVER IS AN ADDITION, NEVER A REPLACEMENT. A hover-only menu is unreachable by keyboard and by touch,
and the two refusals in `useHoverDismiss` are the defensive half of that rule.

### The two delays and why they are asymmetric

The two delays are the correction, and they are asymmetric on purpose: opening is expensive (it opens
the wrong one), closing is cheap (you just come back).

- `HOVER_OPEN_DELAY_MS = 140` — short enough not to feel stuck, long enough for the pointer to cross a
  whole rail without opening anything on the way.
- `HOVER_CLOSE_DELAY_MS = 300` — LONGER than the opening one, and that is what forgives the trip from
  the trigger to the panel: while the pointer crosses the gap between the two, it is over neither of
  them.

### One timer per instance

ONE pending timer per instance, always.

Two live timers at once is how "leaving trigger A" and "entering trigger B" become a race: A's close
would fire after B's open and wipe out the panel the user just asked for. Replacing instead of
accumulating removes the race rather than trying to order it.

A timer that outlives the unmount writes state into a dead component — which in React is a warning
today and a leak always, so `useHoverIntent` cancels on unmount.

### The two refusals of hover dismiss

"Leaving the box closes it", with the two refusals that keep that from costing the user work: the
pointer does not undo what the KEYBOARD is doing (focus inside the box) nor what a DRAG is doing (a
slider taken outside it).

- The drag refusal tracks a drag that STARTED inside. A slider taken outside must not close the box.
- The keyboard refusal: closing here would drop the focus onto `<body>` and the next Tab would start
  over from the top of the page.

The `mousedown` listener sits in the CAPTURE phase and on the document: an inner control that calls
`stopPropagation` on mousedown (several sliders do) would vanish from a bubbling listener.

WHY `enabled` AND NOT THE IDENTITY OF `onDismiss` IN THE DEPENDENCIES. A host that passes
`() => setOpen(false)` creates a new function on every render; with it in the deps, the effect would
reinstall on every render and CLEAR the pending timer — the delay would simply never run out on a
screen that re-renders (all of them). The callback lives in a ref and the deps keep only what actually
changes the behaviour. `HoverDismissOptions.enabled` is the host's answer to whether the box is open;
switched off, nothing is listened to.

## react/theme.ts

### Why a token object and not a styling library

`WorkspaceTheme` holds the tokens every component in this package paints with.

A chart workspace is embedded inside somebody else's application, and a component library that drags
in a CSS-in-JS runtime forces that application to resolve the same runtime — a second copy of an
emotion cache is a second set of class names and a first-paint flash. Everything here is a plain
inline style over a consumer-supplied palette, so the package adds no styling dependency at all and
the host can hand it its own colours.

The defaults are a dark trading surface because that is the ground a candle chart is read against; a
host that wants otherwise passes its own.

### accentFill is declared and never derived

`accentFill` is the fill an active control carries. DECLARED, not derived from `accent` by appending
an alpha pair: that trick only works when the accent happens to be hex, and silently produces an
invalid colour — which renders as no fill at all — for `rgb()`, `oklch()` or a named colour.

### What each token is for

- `background` — behind the canvas. `transparent` lets the host's own surface show through, which is
  the default.
- `referenceLine` — the eye-line a signed pane is read against.
- `surface` — chrome: toolbars, menus, tab strips.
- `control` — form controls sitting on `surface`.
- `accentText` — text over the accent fill.
- `legendShadow` — keeps legend text legible over an arbitrarily bright candle without painting a
  plate.

## react/useCandleLane.ts

### One seed transaction and never two effects

The candle lane fetches history and takes the live cursor as ONE seed transaction.

Fetching the window in one effect and taking the live cursor in another leaves the two unrelated — a
bucket that closes between them reads as contiguous and never enters the series, with no error and no
gap. `openScope` subscribes first, buffers, fetches, checks the seam against the baseline time, and
only then releases. This binding owns the session's LIFETIME and nothing else, and the session closes
as a UNIT: subscription and in-flight fetch together.

`shape: 'delta'` because each frame appends one bar and a lost frame is a permanent hole, so
contiguity has to be policed. That is the lane's semantics, not its transport.

`barCount` takes priority over the window, so the window passed as history
(`from: 0, to: Number.MAX_SAFE_INTEGER`) is the advisory full range.

`CandleLane.scope` of `null` parks the lane: no market chosen yet, so no session and no socket.
`CandleLaneState.outcome` is `null` while the seed transaction is still open, and
`CandleLaneState.seam` says whether the history-to-live seam could be PROVEN — `unverified` is not
`verified`.

### A scope is identified by value

A scope is identified BY VALUE, so the session survives a host re-render. It is normalised here
rather than trusted: a caller passing a fresh literal each render would reopen the socket every time
anything on the page changed, and nobody sees that until they watch the network tab. That is why the
memo depends on `key` and not on the object, and why both the Biome and the ESLint exhaustive-deps
rules are suppressed on that line.

## react/useOverlayFields.ts

### Overlays are created once and never swapped

The two things drawn BEHIND the price action, and how their data reaches them.

Both overlays are created ONCE and never swapped: the surface attaches whatever array it is given, so
a new array per toggle would detach and reattach a canvas primitive to turn a picture off — and a
picture whose data is empty is already off. Toggling is a `set…` call, which is also why dragging a
tuning slider is a repaint and never a refetch.

Only what is switched ON is attached: a primitive asked to draw nothing is still a per-frame call into
a renderer with no work to do.

`PROFILE_BUCKETS = 80` is the number of buckets the profile is built over — enough to separate levels,
few enough to stay a shape.

The profile's live edge is set to the newest bar, so the distribution cannot be drawn over the live
edge it was built from.

`OverlayFields.density` arrives already adapted by the host: which grid a slice describes is the
host's vocabulary, not ours.

### The rail wraps, it does not scroll

A vertical rail 38 px wide with more tools than fit used to scroll. Measured on the example with the
full drawing vocabulary: 600 px of content in a 537 px box, so two tools sat below the fold behind a
scroll gesture nobody performs on a 28 px strip. A tool you cannot see is a tool you do not have.

It now grows by whole columns: `width: max-content` with a one-column minimum, and the rail content
wraps. Measured after: 67 px, two columns, twenty controls, none clipped and no scrollbar.

**The wrap is on the scroll container, not on the tool group, and that took two wrong attempts.**
Putting `maxHeight: 100%` on the group did nothing — a flex item in a column container sizes to its
content, so the ceiling never bit and the rail went on scrolling. Giving the group `flex: 1 1 auto`
instead let it SHRINK, which clipped three tools out of existence: the same defect as the scrollbar,
wearing a better disguise and harder to notice. The container wraps; the group stays whole.

The cost is that the destructive pair lands at the top of the second column rather than under the
tools. That is a palette, and a palette with two columns is what every drawing application shows.
