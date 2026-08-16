# Tabs

The reasoning behind `src/tabs/`: the wire format and its recovery rules, what a tab contains, and the
set arithmetic that makes a strip of tabs behave.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## tabs/codec.ts

### The codec is one job

The tab set, on the wire: written, read back, and recovered from a payload that lies.

THE THREE JOBS ARE ONE JOB. Serialising, checking the version, and deciding what an unreadable payload
means are the same decision seen from three sides — what gets written is what has to be read, and what
cannot be read is what the recovery rule is for. They were spread across an inline `JSON.stringify`
repeated at three call sites and a reader in the same hook file, which is how a payload starts being
written in one shape and read in another.

NOTHING HERE TOUCHES PLATFORM. A store and an exporter are ports declared next door; this module only
turns state into text and text into state, so every rule below is exercised without a DOM.

MIGRATION IS INJECTED, and that is not ceremony. Which earlier formats exist, and what each of them
MEANT, is the history of one product's payload — this package has no way to know that a given older
number was a single configuration rather than a list. What it does own is the ORDER: a payload is
native, or it is migrated, or it degrades — and it never degrades before the migration has been
offered it, because that order is what makes "loads without loss" true. A `migrate` that returns
`null` is saying "not my format", and the payload degrades from there.

`MAX_WORKSPACE_TABS` is re-exported from this module so a consumer reading it knows what caps a
written set.

### Seed and fallback

Deliberately. Nothing ever saved is a VIRGIN state and the consumer may want to seed it; a payload
that exists and cannot be read is a SAVED state that degraded, and seeding over it would invent tabs
where the user had their own. Collapsing the two is the bug this pair exists to prevent.

That is why `payload === null` is the only branch that returns `seed()`, and every unreadable branch —
bad JSON, a non-object, an unrecognised version with no migration, a tab list that does not
sanitize — returns `fallback()`. An unreadable payload deliberately does not land in the seed path:
degrading into seeded tabs would be inventing tabs the user never created.

### Active travels with the tabs

`active` is written into the payload alongside the tabs, because a set restored on the wrong tab is a
set the user has to re-navigate on every reload.

### An unreadable payload degrades

`parseTabsLayout` NEVER throws: an unreadable configuration degrades, because refusing to render is a
worse answer than rendering the product's own defaults.

### A stored index out of range

A non-integer, or an index past the end, is not an error worth losing the tabs over — it is a payload
written by a build that had more of them. It is clamped into range instead.

### No version bump

`coerceIndicatorList` reads the list of active studies with tolerance for the PREVIOUS field, and that
tolerance is the reason there is no new format version for it.

A version bump would send every stored payload through the degrade path, which ERASES the tabs of
anyone who already has state saved. That would make accommodating one field the single most expensive
change in the migration. So the migration happens here, in memory: the older field — a fixed-length
array with holes where a slot was empty — is accepted and compacted in the order it was in. The
current field, when present, WINS; otherwise a payload already rewritten would be dragged back by the
residue of the old one.

Duplicates leave and the excess is cut at the lane ceiling: the two rules the drawing applies anyway,
applied at the boundary so that what is written is what is drawn.

## tabs/setup.ts

### Why this is not generic

What a tab CONTAINS, and how an untrusted payload is coerced onto it.

`WorkspaceTab<S>` is generic; this shape is not, on purpose. The tab machine next door is generic over
the setup because selection, closing and import are set arithmetic and do not care what a tab holds.
Coercion is the opposite — it is entirely about what the setup holds, field by field, and a generic
version of it would be a function that took one coercion per field, which is the coercion written out
with extra ceremony. So the shape is declared here, composed from the things this package already
owns: pane configuration, and density tuning.

WHAT STILL BELONGS TO THE CONSUMER, and arrives as policy: the pane catalogue, which timeframes are
served, how many grid cells fit, which cells to fall back to, the product's own default for the three
switches, and how an indicator list is read. Those are calibration and vocabulary, and a default
written here would be this package having an opinion about somebody else's product. That is why no
field of `WorkspaceSetupPolicy` has a default.

Reading an indicator list is INJECTED for a narrower reason still: it is a MIGRATION question — the
payload may carry the field under its current name or under the one it had before — and migration
belongs to whoever owns the payload's history.

### Mode values are a wire format

Preserved to the character. `'foco'` and `'grade'` already name values inside stored payloads.
Translating them would read as tidying and would be a breaking change: every saved workspace would
fall through the mode check to the default on the next load, and the users who arranged a grid would
find it gone. Same rule the lane identifiers follow, and for the same reason — a string that has been
written to disk is not a name any more.

`'grade'` is the one mode that is not the default, so it is the only one matched by name; anything
else — old, hostile or translated — resolves to `'foco'`.

### Auto fit is per tab

Auto-fit is a PER-TAB preference like every other: one tab follows the live edge, and the tab beside
it, where somebody is studying an old stretch, wants exactly the opposite.

### A list never a pool of slots

The active studies are held IN ORDER, as a list. The drawing position is derived from the position in
this list on every resolution, so removing one promotes the ones below instead of leaving a hole the
next study would inherit.

`movedIndicator` moves one study by one position, or returns the SAME list when the move has nowhere
to land. It lives beside the setup because the order is the setup's: reordering is an edit of this
shape and not a gesture of whatever menu happened to ask for it.

### Grid cells and what is served

Cells are reconciled against the SERVED catalogue, for the same reason the timeframe is: a cell on a
resolution nothing serves opens a scope that never seeds. If nothing survives, the filtered fallback —
and, with anything served at all, at least one cell, so a grid is never born empty.

The same rule reduces a saved `timeframe` to `null` when the current catalogue cannot honour it;
`null` means "no preference the current catalogue can honour", and the workspace decides the default.

### The coercion gate

`coerceWorkspaceSetup` is the gate every payload crosses, from a store or from a picked file.

`=== true` on the three switches, uniformly: an old payload without the field, or a hostile one
carrying a string, never turns anything on by accident, and it costs no new format version.

NOTE WHAT IS ABSENT: no field naming a market. A tab describes CONFIGURATION, and the market it is
applied to belongs to the host — a tab that carried one would move the market on switch.

### Why the fallback is not no tabs

Three independent points in this package refuse an empty list: `sanitizeTabs` answers `null` for one,
the `replace` action declines it, and a tabs bar disables closing the last tab. That is not
redundancy — each of the three protects a different entry — but together they mean a workspace that
reaches zero tabs cannot come back. So a consumer that ships no initial tabs does not get an empty
workspace: it gets ONE, minted from the catalogue's own `defaultVisible` panes, which is the same
setup a restored payload degrades to. Anything else would make "the consumer forgot a list" a mounting
failure.

The list is CAPPED in `seedWorkspaceTabs` as well as on the way in. A consumer handing over more tabs
than the format can store would otherwise see the excess vanish on the first save, which reads as data
loss rather than as a limit.

## tabs/workspaceTabs.ts

### Set arithmetic browser free

A tab is not "another instrument" — it is a whole SETUP: which panes are open, which timeframe, which
layout. What that setup CONTAINS is the host's business, so the tab is generic over it: this module
owns only the rules that make a strip of tabs behave — selection that follows the tab the user was on,
a close that never leaves zero tabs, a duplicate that clones the active setup, and an import gate that
treats a picked file as untrusted input.

Persistence and export are PORTS (`WorkspaceStore`, `WorkspaceExporter`); the browser adapters live in
the host's composition root, which is what keeps every rule here testable without a DOM and this
module importable by anything. The bounds — `MAX_WORKSPACE_TABS` and `MAX_TAB_NAME` — are what keep a
hand-edited or hostile file from wedging the UI.

Two smaller decisions of the action set follow from the same place: the "+" button clones the ACTIVE
tab's setup and takes its id from the caller, because minting one is impure; and import REPLACES
rather than merges, because merging needs a collision rule nobody stated.

### No instrument in a tab

Deliberately. A tab describes CONFIGURATION; the market it is applied to belongs to the host, and a
tab that carried one would move the market on switch. The sanitizer therefore has no field for it: a
payload written by an older host that still carries one loses exactly that field and keeps everything
else — which is the whole migration.

### The last tab is not closable

Every consumer effect reads ONE active setup, and an empty state that exists only to be recovered from
is worse than not offering the action.

### Selection follows the same tab

A close follows the SAME tab the user was on, wherever it landed: closing to the right must not move
the selection, and closing the active one lands on its neighbour, never jumps home.

### A blank rename is a refusal

A blank name is a REFUSAL, not an "unnamed tab": an empty label leaves the tab with no click target
and no accessible name, and the previous name still exists. Returning the SAME object (and not an
equivalent state) is what makes the write path — which only persists when the state changes — persist
nothing. Renaming to the same name lands here for the same reason: a blur with no edit must not cost a
write.

The name is trimmed BEFORE the cut: whitespace at the edges must not eat into the name's budget.

### The single gate on the way in

`sanitizeTabs` is the single gate every tab crosses on the way IN — from a store or from a file the
user picked.

The setup is coerced by the HOST's own function, entry by entry, because only the host knows what a
setup contains and what its bounds are. This gate owns what is generic: the list shape, the cap, the
name bound, and id uniqueness — duplicate ids would make a renderer reuse the wrong tab on reorder and
would break closing by id, so a collision is re-minted rather than trusted.

It returns `null` when the payload is not a usable list at all, so callers can tell "nothing to
import" from "imported zero tabs". `parseTabsPayload` sits on top of the same gate: malformed JSON is
a bad file, never a crash.

### The whole raw entry

Not a `setup` sub-field: older payloads kept the setup fields flat on the tab itself, and the coercion
is what decides which shape it is reading.
