# React chrome

The reasoning behind `src/react/chrome/` — the five replaceable roles, the context that carries
them, the label channel, the flyout panel and the two headless helpers.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

---

## react/chrome/ChromeContext.tsx

### ChromeContext why context and not a prop

Four composed components are already at the ceiling of declared props; a `components` prop would
burst all four. And nothing here changes per streaming frame: what changes on every tick goes down
by prop, what never changes goes down by context. Mixing the two is how one tick value re-renders
every consumer of the context, including the ones that never look at it.

### ChromeContext the three identity disciplines

Three disciplines, and all three are necessary:

1. **Resolution per member, with `??`, never by spread.** `{...DEFAULTS, ...components}` looks like
   it resolves a partial override and does not: an explicitly undefined member OVERWRITES the
   default with `undefined` and the role vanishes. `??` per member has no such hole.
2. **Dependencies on the destructured identities, never on the received object.** A host that writes
   the object in the JSX creates a fresh literal on every render; with the object in the
   dependencies, the context value would change per frame even with the five roles identical. This
   is why the five slots are destructured BEFORE the memo: those identities are what enter the
   dependency array, not the object.
3. **The same rule for theme, labels and sections.** A host that passes a theme assembled in the JSX
   invalidates the memo exactly as an object of roles assembled in the JSX does, and the type
   catches neither of them.

### ChromeContext Body is a component type

`WorkspaceSection.Body` is the host's own content region, embedded in the library's chrome. It is a
component TYPE, not an already-captured tree. A captured tree that needs to change forces the
identity to change, and the context would churn on every interaction; a type hoisted to module scope
has a stable identity for free and re-renders on its own.

### ChromeContext hoisted empty constants

`NO_COMPONENTS` and `NO_SECTIONS` are hoisted to module scope. Destructuring from a fresh literal on
every render would return an identical `undefined`, but the literal itself would enter a memo
dependency in any careless refactor.

### ChromeContext the churn sensor repeats

Recurring with rate limiting — `CHURN_THROTTLE_MS` is 5 000 ms — never "warn on the first one and go
quiet".

Identity churn does not show up as an error: it shows up as "the menu closes by itself" and "the
focus disappears", and nobody connects one to the other. A single warning would be lost in the noise
of the first mount, precisely when there is still no symptom to associate with it.

The sensor's effect carries no dependency array on purpose: what is measured there is the render
itself. It returns early in production, because the defect is one of authorship.

### ChromeContext only the theme has a default

`useWorkspaceChrome` throws outside the provider. A `null` default would let a role render without a
theme; a filled default would hide the wrong mounting until the screen looks strange in production.

`useChromeTheme` is the single exception: the painted tokens alone, defaulted rather than thrown, and
ONLY this member. A leaf published for standalone mounting keeps the fallback it always had while
dropping a prop the provider carries; the roles keep the hard door, because no default for an absent
role is the right one.

---

## react/chrome/FlyoutMenu.tsx

### FlyoutMenu the panel and the trigger are siblings

The component is only the panel, and the trigger stays with the caller. That is not an arbitrary
split: the trigger lives inside the scrolling box and the panel has to be its SIBLING, because
`overflow-y: auto` clips the child on `overflow-x` too and the panel would show up cut in half. A
component that drew the two together would force the panel to be born where it cannot live.

The trigger is an `IconButton` with menu state, and that is why that role gained `state` and
`controls`.

### FlyoutMenu mounted means open

There is no `open` prop: the caller renders it when it opens, and the unmount is the close. That way
the three effects in here — focus, outside click and scroll — are born and die with the panel,
instead of checking a boolean on every pass.

### FlyoutMenu the keyboard is the duty of whoever takes the role

`role="menu"` promises arrow, Home and End traversal; the `<select>` this panel replaced got that
from the platform for free, and swapping it out without writing the handler would have been a silent
accessibility regression.

The handler cancels the event only after `nextRovingIndex` has confirmed the key is ours: cancelling
earlier would steal Tab and the host's typing.

Two constants carry measurements: `MIN_WIDTH_PX` is 208, the reading width for name plus shortcut
without breaking the longest name in the catalogue, and `MAX_HEIGHT_PX` is 360.

Ids are host strings and may carry a space or an accent; a DOM `id` may not — hence `domSafe`.

### FlyoutMenu the pointers safe zone

The optional `hover` pair is the panel's half of the pointer's safe zone, for a caller that opens on
hover. The panel is part of the zone: without this, the one-pixel gap between the trigger and the
panel would close the menu halfway there. Absent, the panel does not react to the pointer — which is
right for a caller that only opens on click.

### FlyoutMenu one scroll listener on the root in capture

A single listener, on the ROOT and in capture.

`scroll` does not bubble, but the capture phase descends from the top down to the target: one
listener on the root reaches any descendant scroller without the panel having to know which one it
is. And `window` is left out by construction — scrolling the page moves the trigger and the panel
together, and there is nothing to correct.

### FlyoutMenu focus except when the pointer opened it

Focus lands on the first item, EXCEPT when the pointer opened it.

A panel opened behind focus only exists for whoever uses the mouse — and the trigger has just
promised, through `aria-expanded`, that something opened. Opened on hover is the opposite: moving
focus would rip the cursor away from wherever the person was typing, without them having asked for
anything.

### FlyoutMenu restoring focus only when the panel holds it

On the three closing paths, focus returns to the trigger BEFORE closing: after unmount there is
nowhere to return it.

The outside-pointer path carries the check that was missing. With focus inside the panel, unmounting
it drops focus on the `<body>` and the next Tab restarts from the top of the page. With focus
outside, the person has already chosen where to go, and pulling it back to the trigger undoes their
own act.

### FlyoutMenu Escape does not leak and Tab is not stolen

The panel's Escape is not the Escape of the chart behind it: closing one thing cannot disarm
another, so the key is stopped from propagating. Tab closes the panel without being cancelled, which
lets focus continue where the host expects it.

---

## react/chrome/IconButton.tsx

### IconButton two layers for one accessible name rule

The glyph-only control carries a mandatory accessible name enforced twice.

A required `label` on the type fails compilation for whoever uses TypeScript, and it is the cheap
layer. It does not reach a host in plain JavaScript, nor one that spreads an `any` object into the
props — both bypass the compiler entirely and ship a button the screen reader announces as "button"
and nothing more. The runtime sensor covers exactly that hole.

And it disappears in production. The defect is one of authorship, not of operation: whoever needs to
see it is whoever is writing the screen, and charging the end consumer the cost fixes nothing.

### IconButton the sensor repeats instead of latching

The sensor is recurrent on purpose: it fires on every mount and on every change of `label`. A module
latch ("warn on the first one and go quiet") hides the second occurrence, which tends to be the one
somebody has just written — the warning that matters is always the one from the call site being
edited.

### IconButton ref is a normal prop not forwardRef

`ref` is a normal prop, not `forwardRef`. Whoever opens a panel from this button needs to return
focus to it when the panel closes; without the ref, focus falls to the document body and the next
Tab restarts from the top of the page.

### IconButton title repeats the accessible name

The same name is also given as the native hint. Inside a scrolling container a panel of its own
would be clipped, and without a portal there is no escaping it: a legible `title` is worth more than
a cut-off box. It never diverges from the accessible name because it is the same string.

### IconButton the glyph does not shrink

`flexShrink: 0`, at `GLYPH_SIZE_PX` of 28. A squeezed glyph is not legible at any size: inside a rail
that scrolls, the alternative to shrinking is scrolling, and scrolling is what the rail already knows
how to do.

---

## react/chrome/Notice.tsx

### Notice severity is mandatory and the live region is unique

`Notice` is the library's only error surface, and the only one that carries a live region.

Severity decides the insistence, and that is why it is MANDATORY. A default would quietly choose how
forcefully the screen reader interrupts the user: an error announced politely arrives after what
they have already done, and information announced assertively cuts them off mid-sentence.

Why only here: a reading that changes on every streaming frame inside a live region drowns the
screen reader's queue with numbers nobody asked for. No other role in this library announces
anything, and that is what keeps this announcement audible.

### Notice the role alone decides the insistence

`alert` is already assertive and `status` is already polite, both by definition of the role.
Declaring `aria-live` alongside would be a second source for the same fact, and the two diverge on
the day somebody edits one of them.

### Notice the fallback dismiss label

`FALLBACK_DISMISS_LABEL` is the last line of defence: a dismiss button with no name is worse than no
button at all. It reads from the contract (`DEFAULT_WORKSPACE_CHROME_LABELS.dismiss`) rather than
holding a copy, so a host that translated the channel is obeyed even here, where the leaf was mounted
without one.

---

## react/chrome/Pill.tsx

### Pill a native button never a div with a role

`Pill` is the text chip, and the highest-traffic role in this library.

The two draw the same and only one of them is keyboard-reachable, takes part in the tab order,
answers Enter and Space and reaches the screen reader disabled without anyone writing a line for it.
Every shortcut here is debt that shows up in the tree of whoever adopted the library, never in ours.

### Pill the state decides the aria and the type decides the state

`action` has no state field, so there is nothing to emit: an action button that announces
`aria-pressed="false"` invents an on/off state the control does not have, and it is the most common
error of the genre. The other three forms each announce their own, and none of them uses
`aria-pressed` for what is not a toggle.

### Pill no focus ring declared

The browser's native one already meets the visibility criterion, respects the system preferences and
costs no bytes at all.

The paint itself comes from the chip already in the series menu; here it stops being local.

---

## react/chrome/Toggle.tsx

### Toggle switch and aria-checked never aria-pressed

`role="switch"` + `aria-checked`, never `aria-pressed`. The wrong combination is the one most often
written: the role already defines the state as checked, and emitting the pressed state as well
announces two overlapping states for the same control. It renders the same and reads wrong.

### Toggle label is mandatory

`label` is mandatory because this control has no visible text to take a name from — the track and the
knob are drawing, and drawing is not a name. The knob's offset is the state itself, drawn; nothing
there is read by a screen reader, which is why it is `aria-hidden`.

### Toggle Enter and Space belong to the browser

A `<button>` is already fired by both keys; what this file does is stay out of the way — no
`onKeyDown`, no `preventDefault`, no role pasted onto an inert element that would have to
reimplement activation by hand.

---

## react/chrome/Tooltip.tsx

### Tooltip the wrapper is the whole trick

Dismissible, hoverable and persistent, with no portal and no focus trap.

Trigger and panel are siblings inside a single positioned wrapper, and it is the WRAPPER that listens
to the pointer. That way the user's real path — leaving the trigger, crossing the gap, entering the
panel to read — never leaves the box that listens, and the tip does not vanish mid-sentence. A
listener on the trigger would close the tip exactly when it becomes necessary.

The wrapper is not the control: it delegates. The interactive element is the trigger that lives
inside it, and the listeners sit there because the pointer has to cross from the trigger to the panel
without leaving the box that listens, and because focus, blur and key bubble up from the trigger to
the wrapper. That is what the `biome-ignore` for `noStaticElementInteractions` records.

Reading is not interacting: the panel never captures the pointer of what is beneath it.

### Tooltip the panel describes it does not label

`aria-describedby` adds the explanation to the name the trigger already has; `aria-labelledby` would
REPLACE it, and the control would come to be named after the tip itself.

### Tooltip Escape closes and does not leak

Behind this tip there is a chart that also listens to Escape; without `stopPropagation`, one key
undoes two things and the user only asked for one.

### Tooltip turned off it falls back to the native title

Inside a scrolling container the panel of its own would be clipped, and without a portal there is no
escaping the clipping — a legible native label is worth more than a box cut in half.

---

## react/chrome/chromeState.ts

### chromeState action emits nothing and the switch stays exhaustive

State to ARIA, once, for every chrome role that carries state.

INVARIANT: `action` emits nothing. A button with no state field that announced `aria-pressed="false"`
would invent an on/off it does not have.

INVARIANT: the mapping returns an object instead of writing attributes into JSX, so the switch stays
exhaustive — a new member of `ChromeState` fails compilation here rather than rendering silently
without its attribute.

### chromeState aria-controls rides only with menu

`aria-controls` rides with `menu` and nothing else: pointing at a panel that does not exist is worse
than not pointing — the reader promises a region and then cannot find it.

---

## react/chrome/labels.ts

### labels English is the default not the only option

LMC-84 — every sentence the composition can say, in one channel the host can replace.

AD-010 made this package monolingual in its CODE — comments, test names, gate messages — and that
decision says nothing about the product of whoever adopts it. A package whose screen cannot change
language only serves the people who already read English, and a host that mounts the root and gets a
screen in the wrong language is looking at a regression it never asked for.

### labels ICU formatting comes from the platform

Replaceable text was never the same thing as correct text, and the shipped default proved it.
Measured on 2026-08-15, in the package's own English: `${panes} panes` rendered **"1 panes"** with one
pane; `panes.join(', ')` rendered "a, b, c" where Portuguese wants "a, b e c"; `toFixed(2)}%`
rendered "1.23%" where Portuguese wants "1,23%". A host that translated every sentence in the channel
would have inherited all three, because all three are decisions the FORMATTER makes and not decisions
the words make.

So a phrase that varies with a count selects its form through `Intl.PluralRules`, an enumeration goes
through `Intl.ListFormat`, and a number or a percentage goes through `Intl.NumberFormat`. The contract
takes a `locale` and falls back to the runtime's when the host brings none.

**The alternative was an i18n runtime, and it was rejected by a market measurement rather than by
taste.** Research on 2026-08-15 found the i18next maintainer and the Astryx design system converging
on the same answer: a component library does not bundle an i18n runtime — it owns a catalogue and a
provider, and the host injects. That is what this channel already was. What the references did and
this package did not was format by ICU, and `Intl` is ES2021, which is this package's target: the
correction costs **zero dependencies**, and AD-002 stands.

**What it did cost, measured:** 330 B on the entry and the same 330 on `ChartWorkspace`, which is the
selection logic entering the bundle. `Intl` itself is the platform and weighs nothing here; choosing
between "pane" and "panes" is code, and code is weighed.

### labels the default is whole

Resolution fills every member from `DEFAULT_WORKSPACE_CHROME_LABELS`, so a host that brings one word
keeps the other forty, and a host that brings nothing renders exactly as it did before this channel
existed. A partial default would hand a consumer a half-empty screen, which is worse than the wrong
language: the wrong language can at least be read.

### labels text that depends on a value is a function

Text that depends on a number or a name is a function, never a string with a placeholder in it.
`Move ${pane} up` and `Mover ${pane} para cima` put the noun in different places, and no two
languages agree on order — a marker-substitution scheme forces every translator into English word
order, which is the same monolingualism wearing a different hat.

### labels this module imports nothing at runtime

Deliberately. Every leaf and every region reads from here, so a value import in this direction would
close a cycle, and an ES-module cycle around a module-scope `const` fails as a temporal-dead-zone
crash at first paint rather than as a warning. The five leaf label types arrive as type imports,
which the compiler erases.

### labels why the groups mirror the components

Groups mirror the component that speaks them, so a translator reads the file in the order the screen
is laid out instead of hunting a flat list of forty-one names.

### labels why each group is Partial

What a host may bring: any member, at either level, and never all of them.

A group is `Partial` because translating one word out of a group of nine and being made to retype the
other eight is how a translation goes stale — the day the package adds a tenth, the host that copied
the group keeps rendering the nine it froze.

### labels filled merges member by member never by spread

The default, with whatever the host brought written over it — member by member, at both levels.

Not a spread, for the reason the chrome provider already documents about roles: `{...defaults,
...given}` lets a member explicitly set to `undefined` overwrite a filled default with nothing, and
the symptom is a control announced as "button" on a screen that used to name it.

A function is never merged into: `typeof` sorts callables out before the recursion, so a host
replacing `state` replaces the whole sentence rather than acquiring a hybrid of two.

---

## react/chrome/primitives.tsx

### primitives why they are not roles

`Box`, `Row`, `Column` and `Text` are the primitives the host does NOT replace.

Swapping a button is customising chrome; swapping the box that stacks the panes is taking over the
library's internal layout. The four here exist so that the five roles and the composites stop
rewriting the same `display: flex` with the same colour read from the same token, and they stay out
of `WorkspaceComponents` on purpose.

`Box` is the chrome surface: the background, the text colour and the family everything else inherits.

### primitives every colour comes from the theme received

Never from a constant in this file. A colour nailed down here renders perfectly under the default
theme and vanishes under the host's — a defect that only exists in the tree of whoever adopted the
library, which is where nobody can debug it.

Secondary text is the same token with less visual weight (`muted`), not a new colour.

### primitives none of them declares a focus ring

The browser's native one already meets the focus visibility criterion, for free and respecting the
system preferences; every attempt to improve on it so far has made it worse.

### primitives the style prop carries geometry not colour

`style` is the caller's GEOMETRY — margin, size, position. Colour does not come in here by
convention: whoever wants another colour swaps the token, not the box. The caller's object is applied
last, so an exception stays possible and stays visible in the diff.

### primitives the stack takes no theme

`Row` and `Column` are pure stacking: no theme, because they paint nothing. A stack that took a theme
only never to use it would force every caller to pass a useless value, and later someone would use
it — which is how a layout box becomes a second painted surface.

---

## react/chrome/rovingFocus.ts

### rovingFocus why this is a module and not a handler

Arrow traversal, as arithmetic — no DOM, no focus, no React.

Two composites already wrote the same calculation by hand [`SeriesMenu.tsx:185-204`,
`DrawingToolbar.tsx:338-366`], and two others wrote none at all — they declared `role="radiogroup"`
and answered no key whatsoever. One more copy would be the third chance to get the same module wrong;
arithmetic kept apart from focus can be exercised without a browser, and that is where the edges
actually live.

What is left out, on purpose: reading the list of controls, moving the focus, and deciding whether
the event is cancelled. All three need DOM, and none of them has an interesting edge. Only the sum
comes in here.

### rovingFocus the orientation is mandatory

`RovingOrientation` is the group's axis, which is what decides WHICH arrows traverse it.

A silent default would pick the group's arrows by omission, and the error would surface as "the arrow
does nothing" on a horizontal bar — the most expensive symptom to diagnose, because it is
indistinguishable from a handler that was never wired.

### rovingFocus null means not mine and it wraps around

The return is the index that should take the focus, or `null` when the key is not a traversal key.

`null` is the "not mine" signal and exists so the caller knows when NOT to cancel the event: a handler
that swallows every key steals Tab, typing and the host's shortcuts.

It wraps around, always. Stopping at the end is indistinguishable from a broken handler to someone
navigating by keyboard — the person presses the arrow, nothing happens, and there is no way to tell
whether they reached the end or the group never answered.

A negative `index` means "nothing in the group holds the focus": going forward hands back the first
and going back hands the last, which is what a person who has just entered the group by its edge
expects.

An empty group returns `null`: there is no control to move to, and returning 0 would point at an item
that is not there.

---

## react/chrome/slots.ts

### slots why roles and not components

The contract of the five chrome roles — what the host may replace, and under what obligations.

A contract that enumerated components ("the close button", "the category chip") would grow with every
new screen and would force the host to implement things it never asked to swap. Five ROLES cover the
whole interactive surface of this library, and the host that wants only its own button swaps one
member and inherits the other four.

The layout and text primitives are left out, on purpose. `Box`, `Row`, `Column` and `Text` are boxes
and text painted with the theme tokens; replacing them is not customising chrome, it is taking over
the library's internal layout. They live in `./primitives` and do not appear here.

What this file imports, and why only that: among this library's layers, `../theme` is the only one —
nothing from domain, port or render crosses the chrome. The `import type` from `react` is the
declared peer and is not a layer of ours: without it, `ComponentType` would have to be redeclared by
hand, and a host role that is not a component would start to compile.

`WorkspaceComponents` keeps all five members optional, which is what makes partial replacement exist:
the host swaps one member and inherits the other four. `ComponentType<XProps>` is what makes a value
that is not a React component fail compilation, instead of becoming a render error on the consumer's
first frame. Five, and the ceiling is written down: a sixth role means the library has stopped
drawing chrome and started asking the host to draw it.

### slots the per-member obligations

**`ChromeState`** — the state a control carries, as a discriminated union, and the discriminant is
what makes the right ARIA the only one the type lets you write. `action` HAS NO STATE FIELD. An
action button that announces `aria-pressed="false"` tells the screen reader there is an on/off state
that does not exist, and it is the most common error of the genre. Here it is impossible: there is no
value to emit because there is no field to read.

**`PillProps`** — chip with visible text, the highest-traffic role. INVARIANT: the accessible name
defaults to the visible content, so the two cannot diverge unless a caller deliberately overrides it
with `label`, which is for a face that is an abbreviation. `disabled` is the NATIVE attribute: it
leaves the tab order without anyone having to manage `tabindex`. `tabIndex` is owned by a group that
traverses by arrow key — exactly one member carries zero.

**`IconButtonProps`** — glyph-only control. `label` is required IN THE TYPE because a glyph is not a
name: without it the screen reader announces "button" and nothing more, and the failure shows up only
for those who cannot see it; omitting it fails compilation instead of shipping.

- `state` is what the control announces about itself. Absent = action, which is the correct silence.
  `Pill` does not serve where this role serves: its accessible name comes from the visible content,
  and a glyph is not a name. A panel trigger and a glyph-only radio button need the same pair — a
  name of their own and a state — and this is where the two meet.
- `controls` is the `id` of the panel this trigger opens. Without it the reader promises a panel it
  cannot find.
- `tabIndex` is zero on the control that receives the group's Tab, minus one on the rest. A radio
  group has ONE tab stop, not one per item — the internal traversal is by arrow key. The one who
  knows which item is the stop is the group, not the button: with nothing checked the rule is the
  first item, and a button on its own has no way of knowing it is the first.
- `hover` is the TRIGGER HALF of the pointer's safe zone, when this button opens a panel on hover.
  The same shape as `FlyoutMenu`'s `hover`, on purpose: the zone has two halves and neither of them
  works alone — leaving the trigger towards the panel crosses a gap, and that is where a naive close
  kills the menu halfway there.
- `ref` is a normal prop, not `forwardRef`: whoever opens a panel must return focus to this trigger.

**`ToggleProps`** — a binary in widget form. `role="switch"` + `aria-checked`, never `aria-pressed`;
the wrong combination is announced as two overlapping states and is the classic error of the role.
`label` is required: the control has no visible text of its own to take a name from.

**`TooltipTriggerProps`** — what the tooltip needs to be able to write onto the trigger, and nothing
beyond that. It is declared because the description is applied ON the trigger, not on the wrapper: a
screen reader announces the description of whoever receives focus, and whoever receives focus is the
control. Every DOM element accepts both; the declaration exists so that the type of the received
element proves it instead of assuming it.

**`TooltipProps`** — rich tooltip, no portal. The panel is a sibling of the trigger inside the same
positioned wrapper, which is what keeps it alive while the pointer crosses it.

- `content` is a string, not a node: `disabled` hands it to the native `title`, which only takes
  text.
- `children` is a single element, because the description is applied ON IT.
- Switched off, the trigger falls back to the browser's native `title`. It is the way out inside a
  scrolling container, where a panel of its own would be clipped — without a portal there is no
  escaping the clip, and a readable `title` is worth more than a clipped box.

**`NoticeProps`** — the library's only error surface, and the only one that carries a live region.
`severity` is required because a default would silently choose the insistence with which the screen
reader interrupts the user. Without `onDismiss` there is no dismiss button; `dismissLabel` is the
accessible name of that button, which follows the `IconButton` contract.

---

## react/chrome/useFlyoutPosition.ts

### useFlyoutPosition the panel is the scrollers sibling never its child

Where a flyout panel lands — measured against the root, clamped on all four sides, no portal.

The panel is the scroller's SIBLING, never its child, and that is why the coordinates here are
relative to the ROOT. An `overflow-y: auto` clips the child in `overflow-x` too, by CSS rule: inside
the scroller the panel would appear cut in half, and escaping that without a portal is only possible
by hanging it on the positioned root. The consequence is that scrolling moves the trigger and does
not move the panel — hence the returned `reposition`, and hence its being wired to the event of the
SCROLLER ITSELF, never to `window`.

`rootRef` is the positioned root: the box everything is measured against, and whose child the panel
is. `triggerRef` is the control that opened the panel, and the panel aligns to ITS height.

### useFlyoutPosition nothing listens to the window

On purpose. Scrolling the page moves the trigger and the panel together, so there is nothing to
correct; a listener on `window` would cost an install, a removal and one recomputation per scroll
frame in order to change nothing.

Both rectangles are read in viewport coordinates, so the rail's internal scrolling is already baked
into the difference — there is no scroll offset to add by hand. The horizontal result is the root's
right edge in px: the usual `left: 100%`, written as a number so that the horizontal axis can be
clamped too.

### useFlyoutPosition why the two axes have different omission rules

With no height declared by the host, the available box is the root's own: the panel lives INSIDE it
vertically. Horizontally it lives OUTSIDE — it touches the edge and overflows on purpose — so the
root's width is not a limit, and using it as the omission would pull the panel back on top of the
rail. With no width declared, there is no horizontal limit to apply.

That is why `availableHeightPx` is documented as the host's box, MEASURED, falling back to the root's
own height, while `availableWidthPx` omitted means no horizontal limit at all.

### useFlyoutPosition clamping without measurements

`clamp` pins the wanted value between the bottom (or right) edge and the top (or left) one. With no
measurements — SSR, or a DOM that does no layout — there is no ceiling to apply, and the panel stays
where the trigger is. Never worse than positioning nothing at all.

### useFlyoutPosition a layout effect not an ordinary one

The measurements only exist after the panel is in the DOM, and an ordinary effect would paint one
frame in the wrong position before correcting it.

### The notice reads the outcome not the seam

`laneNotice` used to be handed the SEAM STATE and asked whether it equalled `'verified'`.

Those are two vocabularies. `SeamState` is `none | anchored | unanchored`; `'verified'` belongs to
`SeedVerdict`, which is `verified | stale | unverifiable`. No seam state can ever equal it, so the
warning fired on every chart that had bars — including charts whose seam was `anchored`, meaning the
anchor was right there.

It type-checked because the parameter had been widened to `string`, which is what let a value from
one enum be compared against a member of another. Reported twice from live use as a banner nobody
could explain, and blamed on the backend; the wire was measured and found correct, carrying
`baselineTime` on every interval.

The notice now reads the SEED OUTCOME, which is the thing that actually answers the question:
`seeded-unverified` means live with an unproven seam, and nothing else earns the warning.

### ChromeContext: sections carry live counts

The churn sensor watches every member of the write-once context and warns when one changes identity
between renders. For `sections` that warning was WRONG, and it accused the host of a fault the
library was committing itself.

`ChartWorkspace` builds the section list with live counts in it — how many panes are visible, how
many overlays are on, how many patterns are active. Those numbers move whenever a pane is toggled or
a study is chosen, so the array is a NEW array, correctly. The sensor read that as churn and told the
host to memoise something it does not own.

What is genuinely write-once about a section is which sections exist, in what order, and which
component draws each. The sensor now compares that shape instead: the ids joined with each `Body`'s
identity, where the identity is a stable number handed out by a `WeakMap`. A body cannot be
stringified and a fresh body every render is the defect worth catching, because it remounts the
panel's whole subtree.

So the sensor still fires on a section added, removed, reordered, or drawn by a new component, and
stays quiet on a count. Verified against the example: choosing a study used to warn on every pick.
