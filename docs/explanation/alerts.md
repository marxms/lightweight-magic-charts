# Alerts

Why the code under `src/alerts/` is shaped the way it is: what a price alert holds, and the moment it
counts as fired.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## alerts/priceAlerts.ts

### Firing on the transition, not on the side

The rule this file exists to get right: an alert fires on the TRANSITION, not on the side.

"Price is above my level" is true on every bar after the crossing, so an alert written against the
side re-fires forever — and the natural fix, firing once and never again, is wrong in the other
direction: a level crossed, retraced and crossed back is two events, and a trader who put a line
there wants both. So the state that matters is which side the price was on LAST, and firing happens
exactly when that changes. `triggered` then suppresses the repeat within one crossing, and moving
the line re-arms it — a level dragged somewhere new has not been crossed yet.

Everything above is decided by `observePrice`, which is pure and takes no chart. The class below it
only owns the drawn line and the drag.

### Ties on the level

Exactly ON the level counts as `above`, and the tie has to be broken somewhere: leaving a third
state for it would make a price resting on the level fire on every bar, once for each direction it
is not moving in.

### Non-finite prices are not observations

A non-finite reading is not an observation. Passing it through would arm every level against a side
computed from NaN, which compares false in both directions and would fire the whole book on the next
real price.

### The axis label is text, never the id

`alert.id` is the bookkeeping key of `PriceAlertLines` — `alert-1`, `alert-2`, minted by a counter
so a handle can be found again. It is not a name for anything, and it used to be half of the axis
label: the default read `alert ${alert.id}`, so the price axis of the deployed dashboard said
`alert alert-1` at a level the user had just placed. An internal key on a user's screen is a defect
regardless of language.

The default is now `Alert` / `Alert ✓`, and the fired mark is what carries the state the user cares
about. The text is a sentence like every other, so it goes through the same channel: the workspace
resolves `labels.priceAlert` and hands it to `PriceAlertStyle.label`, and a host that speaks another
language replaces it there. `label` still receives the whole `PriceAlert`, so a host that wants the
price or the side in the tag has them.

### The testable half is not the drawn half

The alerts themselves are plain values and the transitions are `observePrice`, so everything worth
testing about this feature is testable without a chart. What is left in `PriceAlertLines` — one
price line per alert, plus the drag — is bookkeeping.
