# Pane

The pane layer answers two questions that used to be answered in two different folders: how tall a
pane may be, and what a saved pane list means when it is read back against the catalogue of today.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## src/pane/budget.ts

### The reconciliation policy was hidden in a hook

THIS WAS 127 LINES BEHIND A HOOK NAME. Nothing in this module calls React, touches storage or reads a
clock — it is coercion and set arithmetic over a persisted list — but it lived in a file called
`use*`, which is where logic goes to stop being reviewed.

Nobody opens a hook module expecting a reconciliation policy, so the policy sat there unread while the
two rules it encodes drifted from the ones the renderer applies. Moving it out is what made the drift
visible; nothing about the rules themselves changed on the way.

### Two floors and why they differ

THE TWO FLOORS, NOW ADJACENT. There were two answers, in two folders, to "how low may a pane go":

- **40** (`MIN_PANE_HEIGHT_PX`) clamps what a SAVED height is allowed to be. With
  `MAX_PANE_HEIGHT_PX = 400` it bounds STORAGE: below 40 a saved height is unreadable, above 400 a
  pane eats the price.
- **56** (`DEFAULT_INDICATOR_FLOOR_PX`) is how far the layout policy may SHRINK a pane before it stops
  being readable.

Neither was wrong and they are not the same question — but with one in an app hook and the other in
the layout module, nobody could see that a clamp permits a stored height the renderer would never
actually grant. They now sit a few lines apart, where the disagreement is a thing you read rather than
a thing you discover.

WHY 56. At the 90px default (`DEFAULT_CATALOGUE_HEIGHT_PX`, what a pane asks for when it declares no
target of its own) a pane still shows the axis with two tick labels and a wave with visible amplitude.
Shrinking below ~56px — about 62% of that default — collapses the axis to a single tick and flattens
the series into a ribbon: the pane is still "there" but no longer readable as data, which is the
dishonest middle this floor forbids.

A pane whose own target is already smaller keeps its target as its floor: the policy shrinks, it never
grows a pane the consumer sized deliberately.

The floor is LOWER than the storage minimum is high, and that is not a contradiction: the clamp bounds
what may be STORED as a request, the floor bounds what may be GRANTED under pressure. A pane can
legitimately be granted less than any height a user could have asked for.

### What the consumer still owns

The catalogue (which panes exist, what they are called, how tall they want to be) and the SCHEMA
VERSION.

The version arrives as an argument because it belongs to whoever owns the stored payload: this module
can say what a mismatch MEANS — the whole payload is refused, never migrated field by field — but not
which number is current.

`PaneCatalogueEntry` is what the current build actually offers, and reconciliation is against THIS,
never against the file.

### The honest fallback title

`PaneCatalogueEntry.title` is what the pane is CALLED. Absent, the identifier answers, which is the
honest fallback and not the intended one: a list rendered from identifiers shows `price` where the
product shows Price.

### The entry is a pane fact

INVARIANT: `PaneCatalogueEntry` lives in this layer and not in `catalogue/`, which may not import it.
The type it produces is a pane fact, so its constructor — `toCatalogueEntry` — is one too.

`CataloguedPane` is the shape an entry is minted FROM: any pane whose spec declares an id, a default
visibility and, optionally, a target height and a title. It is structural on purpose, so a catalogue
pane and a generic lane can both be minted from without either importing the other.

### An empty labelled strip

`mintedPaneSpec` is the other direction, and the inverse of `toCatalogueEntry`: the pane an entry
DESCRIBES when the host declared no spec for it — titled, sized, and with no series.

It draws an empty labelled strip rather than nothing, which is the honest answer to "this build offers
this pane and nobody said what goes in it".

`NO_SERIES` is hoisted for a small but real reason: a minted spec is a new object, the emptiness
inside it is not, so there is no need to allocate a fresh empty array per call.

### The title never travels

`PaneConfig.title` is carried from TODAY'S catalogue on every reconciliation, never read back off the
payload.

A name that travelled with a saved list would keep showing whatever the pane was called when it was
stored, long after the build renamed it. So `reconcilePanes` takes the title from `known` and never
from `saved`: the catalogue names the pane, the payload only remembers that it exists.

`PaneLayout.timeframe` follows the same discipline in the other direction: `null` means "no preference
the current catalogue can honour", and the caller decides the default rather than this module
inventing one.

### Known kept unknown dropped new appended

`reconcilePanes` is the pane half of the reconciliation, on its own so a PER-TAB layout can run the
same rules over each tab's panes. The rules are:

- known ids keep their saved order;
- unknown ids are dropped — an id the build no longer has, or a second copy of one it does. A
  duplicate that survived would be a pane the user can switch off twice and never see disappear;
- whatever the catalogue gained since the save is APPENDED, so a pane that did not exist yet arrives
  switched to its own default instead of silently missing.

`clampPaneHeight` is what a stored height goes through on the way in: a stored height is a REQUEST, so
non-numeric or out-of-bounds input falls back rather than throwing.

### Refused whole never migrated

`reconcilePaneLayout` coerces an arbitrary payload — restored from storage or imported from a file —
onto the CURRENT catalogue, and never throws: an unreadable configuration degrades to the defaults,
because refusing to render is a worse answer than rendering the product's own defaults.

A payload from ANOTHER VERSION is refused whole rather than migrated field by field. The reason is
that a stored `false` written while that WAS the default is indistinguishable from a deliberate
choice, so honouring it would take a pane off the screen of everyone who never opened the menu. Losing
a toggle once is the smaller cost, and it is the only honest reading of the old data.

`parsePaneLayout` applies the same rules over a JSON string: malformed input is a missing
configuration, never a crash.

### No field naming a market

NOTE WHAT IS NOT READ by `reconcilePaneLayout`: any field naming a market.

A saved configuration written before the split still carries one, and honouring it would let a tab
move the market it is applied to. The saved timeframe is read, but only survives if the current build
still serves it.
