# Domain

The domain layer is the vocabulary the rest of the package is written in: the branded identifiers,
the specs a pane and a series are declared with, the direction encoding, and the two functions that
turn a declared format or a raw reading into something drawable.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## src/domain/types.ts

### The domain may not name a business concept

THE TEST FOR THIS FILE: no business name may appear in it. Not an indicator name, not a modality, not
an exchange, not a field from our analyzer. If one does, the boundary guard fails.

That is not stylistic. The whole premise of "our proprietary indicators live outside the library" is
only true by construction if the library cannot name them; a single leaked identifier turns the
premise into a promise nobody can check.

### A gap is not a zero

A `Point` without `value` is a DECLARED GAP, not a zero. `isGap` is how a reader asks.

There is no `value: 0` meaning absence anywhere in this library. That conflation is what once let a
line be drawn straight across hours that were never measured — the chart asserted a measurement it
did not have.

### The bar needs its own flag

`barDirectionColoring` colours each point by ITS BAR's direction (close against open) rather than by
the plotted value.

`signColoring` cannot answer this: a magnitude is positive on every bar, so colouring it by its own
sign paints the whole series one colour and says nothing. The direction being encoded here belongs to
the bar, not to the reading, which is why it needs its own flag.

### A unit of its own

`SeriesSpec.format` is this series' own unit, for the case where it does NOT share its pane's axis.

Series in an indicator pane share one scale precisely because they share a unit, and there the pane's
format is the right answer for all of them. A series drawn on a scale of its own is the exception the
price pane creates, and it needs a unit the pane cannot supply.

### Own scale on the price pane

`ownScale` draws a series on a scale of its OWN rather than on the one its pane already has.

It is only meaningful on the price pane, and the two cases there genuinely differ: a study plotted
over the candles must share their axis or it is not over them at all, while a magnitude in the
millions must not, or it flattens the price action into a line at the top of the pane.

Sharing is the default because it is the one that cannot be wrong by accident.

### The glyph is a token

`DirectionGlyph` is the shape channel's value — a TOKEN, not a glyph. Which character or path draws
an apex is a question about a typeface and a canvas, and both belong to the consumer.

`DirectionChannel` names the three channels a mark can carry direction on. Hue is one of three, not
the only one, and that is the entire point of the type existing.

### No hard coded colour convention

`PriceScaleConvention` declares which colour means up. It is NOT fixed to the western convention: in
East Asian markets red is up and green is down, and a library that hard-codes one of them is wrong in
half the world.

`encodeDirectionBy` carries the companion rule: direction must also be carried by something other
than hue.

### Flat has no colour

`DirectionEncoding` is one direction resolved onto every channel the convention declares.

`color` is nullable and `flat` is a real member of `Direction` for the same reason `Point` has no
`value: 0` for absence: a value sitting ON the reference line has no direction, and handing back the
up colour for it would be the chart asserting a reading the data did not make.

So `color` is `null` when the convention does not declare the colour channel, or when there is no
direction at all; and `side` is `+1` above the reference line, `-1` below, `0` on it or when the
position channel is not declared.

### Two invariants the type cannot hold

`directionConvention` is the only sanctioned way to build a convention, because two of its invariants
cannot be expressed in the type and both are silent when broken:

1. HUE ALONE IS NOT AN ENCODING. `encodeDirectionBy: ['color']` type-checks and renders, and it is
   unreadable to roughly one man in twelve — the exact population red/green charting fails. It is
   refused here rather than audited later, so the unreadable configuration never exists.
2. ONE COLOUR IS NOT TWO. Declaring the colour channel with `upColor === downColor` means the channel
   is declared and carries nothing, which reads as configured rather than as broken.

A repeated channel is refused for the same family of reasons, and an empty channel list is refused
because nothing would carry direction at all.

`nonChromaticChannels` is the predicate the second rule is written against: the channels a
colour-blind reader can still use. Emptiness there is the failure condition.

### The flip inverts hue only

`invertConvention` is the east-asian flip, as one call: the same two colours, opposite meanings.

Every other channel is untouched, because position and shape do NOT invert — an apex pointing up
still means up, in every market.

### A gap has no direction

`directionOf` throws on a non-finite value instead of calling it `flat`. A missing measurement is a
gap (`isGap`), and a gap has no direction — filtering happens before encoding, never inside it.

Calling a missing measurement `flat` would be the chart reporting "this value sits exactly on the
reference line", which is a reading nobody took.

### Undeclared channels come back inert

`encodeDirection` resolves a value into every channel the convention declares.

A channel the convention does not declare comes back INERT (`null` / `0` / `'none'`) rather than
populated-and-ignored, so a consumer reading the result can tell what it is actually allowed to rely
on.

Combined with `directionConvention`, that makes the guarantee mechanical: for any direction that is
not `flat`, at least one of `side` and `glyph` is live.

### The catalogue half of the rule

`auditDirectionEncoding` answers which series carry direction, and whether anything but hue carries
it — the catalogue-level half of the rule `directionConvention` enforces on the convention itself.

`signColoring` and `mirrored` are the two flags that mean "this series says up or down". Their
position channel is the pane's reference line: a signed histogram reads as direction because its bars
sit above or below a declared zero, and a mirrored series is negated precisely so it lands on the
other side of one.

Without that line there is no side to be on, and hue is all that is left. That is the violation the
audit reports, pane by pane and series by series.

## src/domain/format.ts

### One formatter for axis and legend

Turning a `ValueFormat` into glyphs used to live in the consumer, and that was defensible only while
the library stopped at DESCRIBING a pane's unit.

It no longer does: the composed surface writes the axis formatter and the legend's figures itself,
and a legend that formats differently from its own axis lies. Both now read `formatterFor`, so the
two cannot drift.

`ValueFormat` is a library type with no business name in it, so nothing about this file knows what is
being measured — only how wide a number is allowed to read.

`minMoveOf` is the axis step, and it is derived from the same declaration: coarser than the
formatter's resolution and labels collide or repeat.

### Price decimals adapt to magnitude

`formatPrice` picks its precision from the value: one decimal at or above a thousand, two at or above
one, six below that.

A 68_000 instrument and a 0.0000042 one cannot share a fixed precision without one of them reading as
noise and the other as a flat line.

## src/domain/readings.ts

### Readings are domain not render

Everything that happens in this file is the application of flags that `SeriesSpec` declares — carrying
across a gap, mirroring under the reference line, colouring by the sign or by the bar's direction —
and those flags are THIS package's vocabulary.

While the conversion lived inside the composed component, the meaning of each flag was written in a
file only a React can run: whoever wanted to check what `mirrored` does had to mount a whole surface.
Here it is a function, and the answer is a call.

`DirectionPalette` is the pair of colours that carry direction. It is never fixed: the host declares
it and it arrives here. `PlottedPoint` is a point as the chart port accepts it, where an absent
`color` means the series paints its declared colour.

### The measured value is not the plotted value

THE DISTINCTION THIS FILE EXISTS TO KEEP: the MEASURED value and the PLOTTED value are not the same
number.

`mirrored` negates what is drawn and not what was read, because the legend prints the measured one — a
legend that repeated the negation would report a quantity nobody measured. The negation lives in
`plottedPoints`, and the carried reading goes on intact to whoever writes the legend.

### Carrying only fits a step function

`carryReadings` applies `stepCarry`, and carrying is only valid for a quantity that stays in force
between publications.

In everything else, a bar with no measurement is a bar with no measurement: the reading stays `null`
and the line breaks, instead of asserting a measurement nobody took.

### Matched by position and the bar beats the sign

`plottedPoints` matches the reading and the bar by POSITION, and the two lists may have different
sizes — a host that has not recomputed the study yet sends fewer readings than bars, and the opposite
happens when the window shrinks.

An index with no bar does not become a point, the same way a null reading does not: inventing either
one is drawing a measurement that does not exist.

The colour is decided in an order that matters: the BAR's direction beats the VALUE's sign when both
flags are declared, because the first speaks of the market and the second of the series, and a series
hung off the bar has no sign of its own to defend.

## src/domain/futureTail.ts

### The future room is whitespace not candles

Measured on a live deploy: the right edge of the chart WAS the last bar — ink reached column 1143 of
1144, leaving zero pixels of room. Nothing projected past the last candle because there was no past
the last candle to project into.

Two things were missing, and one mechanism supplies both. A whitespace point — a time with no price —
occupies a column on the scale, so there is somewhere to draw; and the scale learns that instant, so
`coordinateToTime` answers there instead of returning null. Without the second half a click in the
empty area is discarded, and a drawing tool that cannot anchor is a drawing tool that does nothing.

Two mechanisms were rejected. `timeScale.rightOffset` gives room and no anchorable time, so it is
half the fix — and combined with the tail it would double the gap rather than reinforce it. A logical
coordinate on the port has no caller: the drawing package anchors by time and never invokes the
logical converter it exposes.

The tail exists ONLY in the payload handed to the base library. Overlays, series providers and the
legend read the real bars, so no consumer needs a guard against a candle that is not there.

The interval between future points is measured from the last two real bars. The timeframe belongs to
the host and this library never learns it, so a fixed interval would be a guess wearing the costume
of a fact. With fewer than two bars there is nothing to measure, and the tail is empty.

### Why twelve

Twelve is roughly one session at 4h, and it fits a section panel without eating the data. It is a
default, not a constant of nature: the host overrides it, and `0` restores the old behaviour exactly.

A non-integer or negative count degrades to the default rather than throwing. Half a column has no
meaning on the scale, and a chart that vanishes because the host passed `-1` is worse than a chart
with the default room.

### A margin is only short in proportion

The opening view frames the candles plus a margin, and the margin was first written as a flat twelve
columns. That reads as short next to 800 bars — 1.5% of the width — and it is wrong the moment fewer
bars arrive.

Seen on a live deploy while a timeframe change was reloading history: ONE bar plus twelve columns
framed thirteen slots, so the candle got a thirteenth of the screen and the rest was emptiness.

So the margin is a tenth of what is framed, capped at twelve. Beside 800 bars it is twelve; beside
twenty it is two; beside one it is none, which is what framing by content would have done anyway.

The regression missed this because the test had written the defect down as the expectation: it seeded
two bars and asserted `to: 1 + 12`. A test that states the wrong number in the wrong units passes
forever and protects nothing. It now asserts a RATIO — the framed span must be mostly candles — which
is the property the margin actually has to hold.
