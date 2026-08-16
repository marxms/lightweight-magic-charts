# Indicators

Why the indicator modules resolve, align and report the way they do.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## indicator/availability.ts

What a window LETS YOU READ of a study: where its numbers land, whether they belong on the price
scale, and how much of the window its warm-up ate.

### Alignment is by timestamp

ALIGNMENT IS BY TIMESTAMP, NEVER BY POSITION.

A provider may answer with fewer points than there are bars — every one of them warms up — so
zipping the two arrays would put the first reading on the first bar and shift the whole study left
by its own warm-up.

A study drawn one warm-up out of place still looks like a study, which is exactly why that defect
survives review. `barPositions` builds the bar-time to position map once per resolution, and
`alignReadings` reads it once per point; a point whose time is off the grid is DROPPED, never
appended.

### The measured scale beats the declared flag

A catalogue entry may say it draws over the price and produce oscillator values.

Sharing the price axis with a series two orders of magnitude away FLATTENS the price into a
straight line. The damage is not that the study looks wrong, it is that the price chart stops being
readable — the thing the user actually came for is destroyed by a study they added as a garnish.

So placement is a REQUEST, and `onPriceScale` measures it. See also
[the scale is the fact](#the-scale-is-the-fact), which applies the measurement.

### A rule not a list of ids

Placement is decided by a RULE, not by a list of ids, deliberately: a list ages with every release
of whatever computes the numbers, and nothing announces it.

The rule: a line is "on the price scale" when the median of its magnitude falls in the
neighbourhood of the median price. A study loses its overlay when the MAJORITY of its live lines
fall outside.

The majority is what protects genuine bands. The lower band of a channel leaves the neighbourhood
in a strong trend, and demoting for it would take off the chart exactly the study that belongs to
it.

Two more rules live in `onPriceScale`:

- A DEAD LINE DOES NOT VOTE. A line with no readings at all will not be drawn anywhere, so it is
  excluded before the median is taken; with no live magnitudes at all the answer is `true`.
- `neighbourhood` is a RATIO, so a zero or negative median price makes the question meaningless.
  The caller is expected to skip the measurement there rather than have this invent an answer.

### Both thresholds are parameters

`CALIBRATED_PRICE_NEIGHBOURHOOD` and `CALIBRATED_WARM_UP_SHARE` are parameters with defaults, not
constants: each was calibrated against ONE installed catalogue, so a consumer with a different one is
expected to pass its own. What each number buys, and what it was measured against, is in
[`catalogue.md`](catalogue.md#the-calibrated-ratios).

They are imported from `catalogue/sources`, never written again here.

### Reading a declared gap

`readingOf` asks the package's own `isGap(point)` question. A point with no `value` is a DECLARED
GAP — the package already publishes that question, so this asks it instead of reaching into the
object. A non-finite value is also `null`; `null` is a hole and it is never a zero.

The previous version cast the point to `{ value?: number }` and read the field. That cast was
unsafe in the way that matters: it compiled for any shape at all, so the day the point type gains a
variant, the reader silently answers `null` for every point of it. Nothing fails; the study just
stops having numbers.

### Median not mean

`median` is used rather than the mean so that a single absurd reading from a third-party
calculation does not move a decision. The implementation sorts a copy — the caller's array is never
mutated — and takes the lower of the two middles for even lengths.

### Warm up keeps the lines drawn

`availabilityOf` reports three states: `'empty'`, `'warmup'` and `'ok'`. The difference between
them is what gets SAID, not what gets drawn.

The lines that DO exist stay drawn even at `'warmup'`: real measurements are not rubbish, and the
defect was the silence around them. The difference between "the app broke" and "this window is
short" is not in the chart, it is in the sentence beside it.

`'empty'` is reserved for nothing drawn at all. `'warmup'` is declared when the warm-up consumed
more than `warmUpShare` of the window.

## indicator/coverage.ts

### Coverage is not telemetry

What the load actually delivered, per pane.

INVARIANT: this is not telemetry. A pane drawn from 12 of 400 buckets and one drawn from 400 both
render as a line across a pane, and coverage is the ONLY place the difference is stated. Remove it
and the two become indistinguishable on screen.

`missing` carries the same idea for a whole series: catalogue series this instance draws that
arrived with no reading at all are named, rather than being drawn as an empty pane nobody can
account for.

### Funding is a step function

Funding and open interest are counted by different rules because they ARE different kinds of
measurement.

- Funding is a STEP function. Once the first settlement lands, every later bucket has a rate in
  force. So its coverage counts what the pane can SHOW — every bucket from the first settlement
  onward — not how often the exchange printed. `settlements` is reported separately, for the
  reader who wants the print count.
- Open interest is a measurement, and is counted print by print: only buckets carrying a reading.

## indicator/liveTip.ts

### The division of labour between history and push

The division of labour is FIXED, and it comes from a producer's declared limit: some producers push
the last value per series rather than a series.

So history supplies the bars, and the push updates the TIP — the seam, and why reconstructing a
series out of a scalar is refused, is in
[`port.md`](port.md#the-live-envelope-keeps-the-payload-opaque).

### The last bar is precisely the one with no key

The last bar is precisely the one with NO KEY, and that is why no key is required here.

The persisted series ends at the last CLOSED bar; the last row of the grid is the bar in progress,
and a row only carries a key where there was a reading.

A `key in row` guard therefore wrote only where a value already existed — it switched the tip off
on exactly the bar it exists to fill. That guard was removed for this reason and must not come
back.

### No constraint on the row

`applyTipToLastPoint` puts NO constraint on `T`, and the absence is deliberate.

It used to require `T extends { timestamp: number }`, and nothing in the body ever read that field.
A constraint nobody reads is not documentation: it narrows who may call the function while
protecting nothing, and the next row shape that carries its time under another name is turned away
for no reason.

### The tip decides what is plottable

What decides what is plottable is the TIP, not the row that happened to arrive. Only the fields a
consumer's projection put into the tip are written. The wire never dictates the series shape.

### Identity is the contract

`applyTipToLastPoint` returns the SAME array when nothing changed.

Identity is the contract, not an optimisation: a series that is already current must not cascade a
re-render through every pane, and on a live wire "already current" is the common case between two
pushes that carry the same value.

### The same fold seen as a column

`readingWithTip` is the SAME fold, seen one column at a time: a reader answers per series, not per
row.

A grid is the shape a consumer that owns rows already has; a composition that asks a reader for one
series at a time has a column. Both are the same rule — write only what the tip carries, into the
bar in progress, and return the SAME array when nothing changed — so the rule is APPLIED here
rather than restated, and the one-field row is the whole of the adaptation.

## indicator/resolution.ts

A list of chosen sources, resolved into drawable lines: which lane each one gets, which lines
survive, what the legend calls them, and which lanes end up with anything in them.

### A list not a pool of slots

A LIST, NOT A POOL OF SLOTS. The lane is DERIVED from the position in the list on every resolution,
never stored on the source.

That single change is what makes removal work: dropping the first promotes the second, and the lane
that falls off the end has no key anywhere in the result — which is the only way it disappears from
the pane, the legend and the readings at once.

With a stored slot, choosing a study pinned it there, its lane stayed lit after it left, and the
next one inherited whatever was still on screen.

### The lane ceiling is physical

The lane ceiling is PHYSICAL, and `laneOrder` cuts from the END of the list.

Panes and series are created at mount ([`render.md`](render.md#creation-once-at-mount)), so the
number of lanes is a RESOURCE, not a preference.

Cutting from the end is what makes the ceiling a LIMIT rather than a substitution. The pool this
replaced overwrote the first slot when it filled, and that is how a study vanished without anyone
having removed it.

`laneOrder` also drops duplicates, keeping the first occurrence.

### The catalogue enters as a lookup

The catalogue enters as a LOOKUP, and the duplicate rule comes with it.

This package cannot enumerate what a consumer may plot, so it is handed a function from id to
source. What that function does with a repeated id is the CONSUMER's decision and it is not a
detail: a scan over a list keeps the FIRST, a keyed map keeps the LAST, and the two disagree
silently.

Nothing here builds a lookup out of a list, precisely so the choice stays where it can be made.

### No bars still a list

With no bars there is no grid to align onto, but the LIST is still the list: the views come out so
a panel can show (and remove) what the user chose before the data arrived.

In that branch nothing was MEASURED, so nothing is asserted. `availability: 'ok'` is the ABSENCE of
a diagnosis; reporting "no data" there would blame the source for the window not having arrived.

### A throwing source costs only itself

`source.series()` and `plot.provider.compute(bars)` are both called inside a `try`.

A third-party computation that throws must cost THIS source and nothing else: the chart still has
its other lanes, and taking the whole workspace down over one study is not a trade anybody would
make. A source whose `series()` throws is reported `'empty'`, keeping its label and its declared
placement; a single plot that throws is treated as a line with no values.

### A dead line draws nothing

A DEAD LINE OCCUPIES NEITHER LANE NOR LEGEND.

Many sources declare CONDITIONAL plots, and they arrive as a whole series of nothing, marked
visible. That produced rows of labels with no value beside them; worse, the dead ones consumed the
lane's line budget and pushed out lines that DO have data.

So `alive` filters to plots with at least one non-null reading before `policy.plotsPerLane` is
applied, and `truncated` reports how many live lines did not fit.

### The scale is the fact

The placement is a REQUEST; the scale is the FACT, and the fact wins.

The measurement runs over the lines that WOULD be drawn, which is where the flattening would
happen. A declared overlay is demoted when more than half of its live lines are off the price
scale (`offScale * 2 <= alive.length` keeps it).

`priceMid > 0` guards the ratio: the neighbourhood is a RATIO, and with a zero or negative price
(no real market, but degenerate bars do arrive) it would stop existing and demote every overlay.

See [the measured scale beats the declared flag](#the-measured-scale-beats-the-declared-flag) for
why the flag alone is not trusted.

### A guide belongs to its own axis

A guide only means anything against the source's OWN axis. Drawn on the price scale it would be a
dashed line lying about which scale it belongs to, so an overlay never carries one and the field is
omitted rather than set to a sentinel.

The warm-up note that sits beside `firstReadingAt` in this file is the same rule as
[warm up keeps the lines drawn](#warm-up-keeps-the-lines-drawn): the lines that exist stay drawn
even at `'warmup'`, because real measurements are not rubbish and the defect was the silence around
them.
