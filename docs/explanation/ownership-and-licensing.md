# Ownership and licensing

Who owns what, and what this package's licence position actually is — measured against the manifests
and held in place by gates, rather than asserted.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## The short answer

**The indicator catalogue is the host's.** So is the drawing vocabulary, the pattern vocabulary, the
symbol search and the storage. This package owns the generic constructors, the composition and the
chrome. If you are looking for where a moving average is defined, it is not here and never was — see
[`catalogue.md`](catalogue.md) for the argument and
[`../how-to/inject-catalogue.md`](../how-to/inject-catalogue.md) for the wiring.

## What the package declares

Measured against `package.json`:

| Field | Value |
| --- | --- |
| `dependencies` | **absent — zero runtime dependencies** |
| `peerDependencies` | exactly two: `react` (`>=18.0.0 <20`) and `lightweight-charts` (`>=5.2.0 <6`) |
| `peerDependenciesMeta` | both marked `optional: false` — required, not suggested |
| `license` | Apache-2.0 |

Anything on the public signature is a peer by design. A package that renders through a chart library
and also depends on one at runtime would force the consumer to resolve two copies of it.

**This is asserted, not promised.** `test/gates/packaging.spec.ts` reads the published manifest and
fails the build if a runtime dependency appears or the peer list is anything other than those two,
and it drives a real `npm install` at both ends of each range to confirm the refusal names the range.

## The three third-party libraries, and whose they are

`lightweight-charts-drawing`, `lightweight-charts-indicators` and `oakscriptjs` are real, they are
used, and they are **dependencies of the consuming application** — `apps/web/package.json` — not of
this package. Measured on 2026-08-15, from each installed manifest:

| Package | Version | Licence | Declared by |
| --- | --- | --- | --- |
| `lightweight-charts-drawing` | 0.1.1 | MIT | the consuming application |
| `lightweight-charts-indicators` | 0.5.0 | MIT | the consuming application |
| `oakscriptjs` | 0.5.0 | MIT | the consuming application |

MIT is permissive and compatible with Apache-2.0 in the direction that matters here: an Apache-2.0
work may depend on MIT code. It never comes up, because this package does not depend on them.

**This is asserted too.** `test/boundary.spec.ts`, in the clause *"imports no third-party indicator
catalogue at module scope"*, bans all three by name anywhere in `src/` and proves the ban discriminates:
a synthetic `import { Tool } from 'lightweight-charts-drawing'` is reported, and a neighbouring
relative import is not. The application-side half of the same guard lives in
`apps/web/src/config/__tests__/catalogBoundary.test.ts`.

An earlier version of this code did import one of them and walked the catalogue at module-evaluation
time, which retained the whole catalogue whether or not a single indicator was drawn. That is the
defect the ban exists to prevent, and it is why the ban is on the import rather than on the usage.

## The vocabulary is injected, all of it

The package draws tools and patterns it cannot name:

- **drawing tools** arrive as `DrawingTool` values in `drawing.vocabulary`; the rail renders the
  label and the glyph it is handed. See [`../how-to/bind-drawing.md`](../how-to/bind-drawing.md);
- **candle patterns** arrive as `CandlePatternChoice` values in the `patterns` prop;
- **indicators** arrive as `SeriesProvider` instances through `studies.catalogue`, each carrying its
  own `compute`. See [`extension.md`](extension.md) for why extension is by instance and not by name.

**Asserted by the clause *"names no business concept"*** in `test/boundary.spec.ts`, which fails the
build if any of thirteen proprietary names — an indicator, a modality, a field name — appears in
`src/` after comments are stripped.

**And the precise limit of that claim, because an overclaim is worse than a caveat.** The gate bans a
declared list of *our* business names; it is not a general ban on every word that could be a tool or a
pattern. One candle-pattern word does appear in the tree: `src/overlays/troughProfile.ts` has a
comment saying *"A doji spans zero price; the epsilon keeps the division defined"*. It explains why a
zero-span bar needs an epsilon. It names no offering, exports nothing, and appears in no signature —
but "the package contains no pattern name anywhere" would be false, and the honest statement is that
it **declares** no tool and no pattern.

## The name, and TradingView

Handled in [`NOTICE`](../../NOTICE), which is the file that carries it: the package renders through
`lightweight-charts`, echoes its name on purpose, declares it as a required peer rather than
redistributing it, and disclaims any affiliation with TradingView, Inc. The reasoning for why that
file exists at all — Apache-2.0 clause 4(d) does not oblige it, clause 6 grants no trademark rights —
is written there and is not repeated here.

## Who owns the indicator catalogue

The host. That is the sentence this page exists to make findable, and every gate named above is what
keeps it true after the next release.
