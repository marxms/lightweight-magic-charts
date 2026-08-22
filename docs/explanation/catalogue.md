# Catalogue

The catalogue layer is the generic half of "what gets plotted". It assembles a pane and its series,
pre-creates and names the drawing lanes, relabels a lane for whatever study currently occupies it,
and describes how a plottable source asks to be placed. What it never does is enumerate a consumer's
vocabulary: the names, the palette and the grouping belong to whoever owns the numbers.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## src/catalogue/direction.ts

### Glyph and colour are one

A direction carried on two channels is only readable while the two agree, and they agree because
they were derived from ONE encoding. Put the glyph on one side of a boundary and the colour on the
other and the pair can be corrected independently: a label reading up beside a bar painted down
renders perfectly, passes review, and says two different things.

The second channel exists precisely so hue is not the only answer, and splitting the pair is how it
quietly stops being a second answer at all. That is why the glyph table and the colour resolver live
in one file rather than in the two layers each would naturally belong to.

### The glyph table is a default

The domain layer answers with a TOKEN and will keep doing so: which character or path draws an apex
is a question about a typeface, and typefaces belong to whoever renders.

What `DIRECTION_GLYPH_TEXT` publishes is one rendering of that token FOR TEXT, as a plain record — a
consumer with its own typeface reads its own table and never calls this one. A default that can be
read and replaced is not a hard-coded typeface; a table hidden inside a function would be.

`none` maps to the empty string. The inert token is a real member of the table, so a caller never has
to special-case the direction that has no glyph.

### Appending costs no separator

`withGlyph` joins with a space only between parts that are non-empty. The inert token contributes
nothing AND costs no separator: a trailing space would be an invisible difference between two labels
that read identically.

### No fallback pair

`directionColor` FAILS LOUD, at the call that needs a colour, when the convention declares no colour
channel. The alternative is falling back to a pair this library picked, and that fallback is exactly
the hard-coded western convention the declaration exists to remove: it would render, it would look
right to whoever wrote it, and it would be wrong in half the world with nothing said.

The signature takes `1 | -1` and never `0`: a value on the reference line has no direction, so asking
for its colour is a question with no answer, and the type refuses to let it be asked.

## src/catalogue/draft.ts

### Assembly is not authorial

A catalogue is authorial. The names, the palette and the grouping belong to whoever owns the numbers,
and this package can neither import nor enumerate any of it.

The ASSEMBLY is not authorial, and it is the part every consumer was rewriting: minting the branded
identifiers, keeping whatever the consumer binds each series to OUT of the drawn spec, and building
the pane's series list FROM the bound series so the two cannot disagree.

The binding is a type parameter and stays one: where the numbers come from, which lane a plot belongs
to, a key nothing here can name. It travels through untouched and never reaches the spec.

### Minting the brand

`SeriesDraft` is a series as the consumer writes it: everything the library draws, plus the payload
it does not read. The identifier is a plain `string` there because minting the brand is this module's
job — a consumer that had to brand it first would need the branding function in order to write a
literal.

`BoundSeries` then keeps the drawn spec and the consumer's payload side by side and never merges
them, so nothing the consumer attached can leak into what gets drawn.

### Format arrives resolved

`PaneDraft` takes `format` already resolved. A name-to-format table is a catalogue of its own, and
resolving one here would put the consumer's vocabulary in this file — the exact thing the layer
exists not to do.

### Derived so the two cannot drift

This is why `SeriesDraft`/`PaneDraft` are a pair and not two literals. A pane written by hand carries
its series twice — once as the list the consumer keeps for reading numbers, once as `PaneSpec.series`
for drawing them — and two declarations of one fact drift.

In `bindPane` the second is DERIVED from the first, so a series that is bound is drawn and a series
that is drawn was bound.

## src/catalogue/lanes.ts

### Why lanes exist at all

The reason is physical and it is not a preference: panes are created once, at mount
([`render.md`](render.md#creation-once-at-mount)). A consumer that could add studies without limit
would have to create panes at runtime, which is the failure the pane stack exists to prevent.

So there is a fixed number of pre-created lanes and it is a RESOURCE CEILING — how many is the
consumer's calibration, and it arrives as a parameter rather than as a constant compiled in here.

### The lane identifiers

ONE-BASED IN THE TEXT, ZERO-BASED IN THE ARGUMENT, and deliberately so: the index is a position in a
list and the identifier is a persisted key. The exact strings `ind<n>`, `ind<n>p<m>` and `ovl<n>p<m>`
already name fields in stored rows, so the format is a wire format and is preserved to the character.

WHY THE TWO MINTERS SIT IN ONE FILE. A study is drawn either against its own axis or over the price
action, and which of the two is a property of the study. The choice is therefore a ternary at the call
site, and the two branches of that ternary mint two different identifiers for the same lane and plot.
Split them across the boundary and one half can be corrected without the other — the identifiers stop
agreeing about numbering, and the symptom is a study that vanishes on the way from the pane to the
legend, never an error.

### The fallback title

`LaneDraftOptions.title` is a label of last resort. A VISIBLE lane always wears the name of whatever
occupies it, and a lane with nothing in it is never visible — so this text is what the consumer wants
read in the one case neither of those holds.

`plots` is how many lines the lane is built to hold — a RESOURCE the consumer mints at creation, not
a policy the resolver applies. `bind` is what the consumer needs to remember about each line, keyed
by the field just minted.

### The palette does not rise

Colour is the consumer's, and lifting it would make this layer need a theme — which would close a
cycle with the chrome layer, since chrome already imports the theme and nothing else may.

So `colors` is an argument with no default: a module that shipped one would be a palette in hiding.
It is cycled by position, and an empty palette throws rather than drawing a line with no colour to
take.

### The lane is born collapsed

The empty lane is born COLLAPSED because the list of studies is born empty, and a visible lane with
nothing in it is the defect this shape exists to avoid: an empty pane holding open space on screen.

Visibility is DERIVED from what occupies the lane, never persisted or toggled by hand.

## src/catalogue/relabel.ts

### Relabelling moves only labels

INVARIANT: only LABELS move. A series' colour is decided when the chart creates it and is never
restyled, so a lane draws in its own palette and says in the legend which study is in it.

INVARIANT: `guide` absent PRESERVES the pane's declared reference line instead of erasing it. A
catalogue pane owns its own level; a generic lane borrows the occupant's. Absent and "set to nothing"
are therefore different requests, and only the second one can clear a line.

`relabelled` returns the pane UNCHANGED when there is nothing to change — no title, no matching
field, no guide — so a caller can run it unconditionally without minting a new object per frame.

## src/catalogue/sources.ts

### Why not widen SeriesProvider

A provider answers one question — given these bars, what are the points — and that is the whole
reason an overlay author can write one in a few lines.

What a resolver needs is a level up: an entry that owns a SET of drawn-spec/provider pairs and asks
to be placed somewhere. Folding placement into the provider would make every author of a single
computed line declare an opinion about where studies sit relative to the price scale, which is a
question about a chart they are not looking at. So the provider stays exactly as it is and
`PlottableSource` composes it.

`PlottedSeries` is how the drawn shape and the numbers behind it travel together, as one pair, for the
same reason: neither half means anything to the resolver without the other.

### Placement is a request

PLACEMENT IS A REQUEST, NEVER A FACT. The source declares where it wants to be drawn; the resolver
measures the scale of what actually came back and may refuse.

A source asking to sit over the price action while producing values orders of magnitude away from it
does not merely look wrong — it flattens the price into a straight line, and the price chart stops
being readable. The declaration loses to the measurement, so the field is named `PlacementRequest`
for what it is.

The other fields on `PlottableSource` follow the same discipline:

- `id` is the consumer's own identifier. It is what a lookup is asked about, and nothing parses it.
- `label` is shown in place of a lane's fallback title once the source occupies one.
- `guide` is a neutral level worth marking on the source's own axis. Absent is the normal case, and it
  stays absent rather than becoming a number that means nothing: drawn against the price scale it
  would be a dashed line lying about which scale it belongs to.
- `series()` is CALLED, never read as a field. Computation is on demand and may throw, and a throwing
  entry must cost only itself — as a field it would throw while the catalogue was being built and take
  everything with it.

### The catalogue enters as a lookup

THE CATALOGUE ENTERS AS A LOOKUP, NOT AS A CONTAINER. This library must never enumerate what a
consumer can plot: enumeration is how a catalogue of hundreds of entries gets retained whole because
something walked it once, and it is how proprietary names end up crossing this boundary.

A `SourceLookup` answers about the one id it was asked about and can say nothing else — one id, one
answer, `undefined` for an id this consumer did not wire.

### No helper builds a lookup from a list

NOTE WHAT IS ABSENT: there is no helper here that turns a list of sources into a lookup.

Building one means choosing what a repeated id means, and the two obvious choices disagree — a scan
keeps the FIRST, a keyed map keeps the LAST. That choice belongs to whoever owns the list, so the
library declines to make it silently.

### The policy is data not constants

`ResolutionPolicy` is what the resolver is allowed to assume, as data rather than as constants
compiled into it.

The count is a RESOURCE the consumer owns, for the reason above: how many lanes exist is a decision
about the consumer's chart. `lanes` therefore has no default, because there is none to have.

There is NO companion ceiling on lines per lane. There was one, and it was a defect: one number
written by the host for every study at once cut 89 of 320 offered indicators, and the Ichimoku Cloud
lost exactly the two plots that ARE the cloud. How many lines a study has is a property of the
study, so the resolver takes it from the study.

The two ratios are CALIBRATION: `priceNeighbourhood` is how many times away from the price level a
line may sit and still be drawn over it, and `warmUpShare` is the share of the window a warm-up may
consume before the window stops holding the source.

### The calibrated ratios

`CALIBRATED_PRICE_NEIGHBOURHOOD = 3` and `CALIBRATED_WARM_UP_SHARE = 0.5` were each measured against
one installed catalogue, and a number measured against one catalogue is a default, not a law.

Three separates a genuine band, which tracks the price closely, from an oscillator that declares
itself an overlay and sits orders of magnitude away. A half is the point at which a warm-up has eaten
more of the window than it left.

`resolutionPolicy()` is the single place either number is written. A second copy is how two callers
start disagreeing about what "over the price" means.
