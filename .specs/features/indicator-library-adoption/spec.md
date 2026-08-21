# Indicator library adoption: parameterised studies from a third-party catalogue

## Problem Statement

The workspace can turn a study on and off but cannot let a user change what it computes. `SeriesProvider.compute(bars)`
takes no parameters, `SeriesCatalogueEntry` carries no inputs, and `WorkspaceSetup.indicators` is
`readonly string[]` — so "SMA 20" and "SMA 50" can only be two catalogue entries, and a value the user
edited has nowhere to be written. Meanwhile `lightweight-charts-indicators@0.5.0` ships 457 indicators
that each carry a machine-readable `inputConfig[]`, and the owner wants them displayed, computed and
parameterised, with the edited values surviving a tab round-trip.

A five-juror panel decided by measurement where the library may live: the host, not `src/`. One
indicator costs ~1,050,000 minified bytes — ten times this package's whole entry — and injecting
`sideEffects: false` into the installed package produces byte-identical output, so tree-shaking is not
an available remedy. The owner then closed the question the panel named as decisive: parameter values
must persist **per tab**, across duplicate, export and import. That is the one thing a host cannot do
alone, because the persisted shape belongs to this package.

## Goals

- [ ] The boundary gate detects a dynamic `import()` — a synthetic `await import('lightweight-charts-indicators')` under `src/` fails the suite, and a neighbouring relative dynamic import does not
- [ ] A study's edited parameter values survive duplicate-tab, export and re-import, byte-for-byte
- [ ] A study's persisted identity is a stable id, not the text on screen — so translating a label costs neither the study nor its settings
- [ ] `src/` gains zero bytes of any third-party indicator catalogue — the entry stays under its declared limit and the by-name ban still passes
- [ ] The example and the consumer application draw indicators from the library through one adapter shape, and neither asks this package to name an indicator

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Importing `lightweight-charts-indicators` or `oakscriptjs` from `src/` | Measured impossible: one indicator is ~1,050,000 B against an entry whose limit IS its measurement under a down-only ratchet, and `oakscriptjs` is a required peer that `packaging.spec.ts` forbids declaring. AD-006 and `boundary.spec.ts:514` already refuse it |
| The library rendering a settings form from vendor metadata | Naming an indicator's inputs names the host's business. The vendor's `title` strings are English and unbounded (457 indicators × up to 6 inputs); `chrome.labels` is a closed record of groups and cannot hold them |
| A colour or line-width control per study | `SeriesSpec.color` is required and host-supplied, and the vendor's own demo ships neither. A `type:'color'` input would render a picker that changes nothing |
| Band / cloud / fill shapes (Ichimoku, Bollinger fill) | `SeriesSpec.shape` is `'line' \| 'histogram' \| 'area'` and `laneDraft` hard-codes `'line'`. It is a different subsystem — the spec, the lane draft and the render factory — and folding it in would double this feature. The curated catalogue must therefore exclude indicators whose reading depends on a fill; DEMO-01 says so. This is the natural next feature, not part of this one |
| Guarding `SeriesProvider` against a provider that mutates `bars` | The seam builds `positionOf` once before the loop, so a mutating provider would corrupt later sources in the same pass. Measured against this vendor: inputs are not mutated (deep-equality snapshot before/after) and there is no global state. A real hardening ticket, with no bearing on this decision |
| Raising `PROVISIONAL_ENTRY_LIMIT` | The ceiling has never been raised and is not raised here. Every byte this feature costs is re-pinned one measured candidate at a time |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| What "parameterise the inputs" means | Editable at runtime AND persisted per tab | Owner answered directly; it is the answer that decides whether the ceiling is the host's or the package's | y |
| Where the adapter lives | Both `example/` and the consuming application | Owner answered directly. The example demonstrates, the app consumes, and the e2e suite then exercises the real path | y |
| Whether the gate hole is in scope | Yes, and first | Owner answered directly. With the library entering the host, `importsOf` becomes the only gatekeeper standing between 1.05 MB and `src/`, and it is currently blind to `import()` | y |
| How the package holds a parameter value | As a value it never interprets — opaque to `src/` | Interpreting it would mean modelling the vendor's `inputConfig` inside `src/`, which reintroduces the business vocabulary the boundary exists to keep out. Opacity is what lets the package persist without naming | n |
| Whether an older saved payload must still load | Yes, without a version bump | `coerceIndicatorList` is already documented as "tolerant of the PREVIOUS field" under the `#no-version-bump` anchor. A second migration follows the precedent the first one set | n |
| Which indicators the example offers | A curated subset, not all 457 | 73 of the registry entries return no plot at all and 42 have no named export. An uncurated catalogue ships toggles that silently do nothing | n |
| Whether AD-006's example clause is overturned | Yes, explicitly, with a new decision recorded | The owner chose "both". A decision reversed in silence is worse than one never recorded — the new entry must state what changed and what evidence changed it | n |
| Warm-up values from the vendor | Converted to declared gaps at the adapter | 362 of 457 indicators emit `NaN`; this domain says a point without `value` is a gap and `readingOf` already reads non-finite as `null`. The conversion belongs where the vendor's shape is translated | n |
| How a study is identified in stored state | A stable id supplied by the host, falling back to the label when absent | A settings map keyed by displayed text orphans on translation, and `laneOrder` deduplicates by exact string so two of 457 sharing a label would collide. The fallback keeps every existing host compiling and drawing | n |
| Whether `SeriesCatalogueEntry.id` is optional | Yes — optional, label as fallback | The repository evolves by additive optional member (`guide?`, `hint?`, `selected?`, `anchorAt?`). A required field would break every host that built a catalogue before this | n |
| Node/browser support matrix | Unchanged — Node 22/24/26 and the existing Chromium e2e | Nothing here touches the runtime floor; the library is `--platform=neutral` and the adapter is host code | n |

**Implicit-requirement dimensions sweep** (Large scope — every dimension resolves):

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | PARAM-04, ADAPT-04 — a persisted value that does not match the catalogue's declared bounds is refused, not clamped silently |
| Failure / partial-failure states | ADAPT-03 — a computation that throws costs one study and nothing else; the existing per-plot `try/catch` is the guarantee to preserve |
| Idempotency / retry / duplicate handling | PARAM-03 — coercion of the same payload twice yields the same setup; N/A for retries, because nothing here crosses a network |
| Auth boundaries & rate limits | N/A because this feature adds no callable surface and no network call — the library is a pure function over bars |
| Concurrency / ordering | ADAPT-05 — points arriving out of the bar grid are dropped by timestamp alignment, never appended; no concurrent writer exists for a tab's setup |
| Data lifecycle / expiry | PARAM-05 — values for a study no longer in the list are dropped on coercion, so a payload cannot grow without bound |
| Observability | N/A because the package emits no telemetry by contract and this feature adds no diagnostic surface; a study that cannot draw already reports `availability` |
| External-dependency failure | ADAPT-03, DEMO-03 — the library is a host dependency; if it is absent or fails to load, the host's catalogue is empty and the workspace draws no study rather than failing to mount |
| State-transition integrity | PARAM-02, IDENT-02 — editing a value must not change a study's identity, its lane, or its position in the list, and identity itself must not change when the label does |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: The boundary gate sees a dynamic import ⭐ MVP

**User Story**: As the maintainer of this package, I want the by-name ban to catch `await import('...')`
so that the boundary the package defines itself by cannot be crossed by a form the guard never looked at.

**Why P1**: With the library entering the host, `importsOf` becomes the only gatekeeper between 1.05 MB
and `src/`. Reproduced with the repo's own TypeScript: the predicate captures a static import and a
`require`, and returns nothing for `await import('lightweight-charts-indicators')`, because the
`CallExpression` branch demands `ts.isIdentifier(node.expression)` and `import` is an `ImportKeyword`.

**Acceptance Criteria**:

1. WHEN a source under `src/` contains `await import('lightweight-charts-indicators')` THEN the boundary suite SHALL report that specifier as a violation  <!-- event-driven -->
2. WHEN a source under `src/` contains a dynamic import of a relative path THEN the boundary suite SHALL report no violation for it  <!-- event-driven -->
3. The boundary suite SHALL assert both of the above against synthetic sources, so the clause discriminates rather than passing over an empty set  <!-- ubiquitous -->
4. WHEN the layer rules are evaluated THEN a dynamic import of a bare specifier SHALL be judged by the same allow-list as a static one  <!-- event-driven -->

**Independent Test**: Add the synthetic sources, run `npx jest test/boundary.spec.ts` — the new positive control fails before the predicate is fixed and passes after, with the rest of the suite unchanged.

---

### P1: A study is identified by something that is not on screen ⭐ MVP

**User Story**: As a user of the workspace, I want my saved studies and their settings to survive the
product being translated or a label being reworded, so that changing a word does not silently empty my chart.

**Why P1**: PARAM-01 asks for a per-study settings map, and today the key would be `entry.label` — the
displayed text (`ChartWorkspace.tsx:298`). `SeriesCatalogueEntry` carries no id at all. The example
already works around this by keying its lookup on both id and label, and says in writing that "a display
string is the wrong identity for stored state". With 457 catalogue entries an exact label collision stops
being hypothetical, and `laneOrder` deduplicates by exact string — so the second entry never activates and
would share the first one's settings. Persisting values on top of that key multiplies the blast radius
from "which studies were on" to "and what each was set to".

**Acceptance Criteria**:

1. WHEN a host supplies a catalogue entry carrying an id THEN the workspace SHALL persist that id as the study's identity  <!-- event-driven -->
2. WHEN a study's label changes and its id does not THEN the workspace SHALL keep that study selected and keep its parameter values  <!-- event-driven -->
3. WHERE a catalogue entry carries no id the workspace SHALL fall back to its label, so a catalogue built before this feature still resolves  <!-- optional-feature -->
4. IF two entries in one catalogue resolve to the same identity THEN the workspace SHALL report it through the notice channel rather than silently dropping the second  <!-- unwanted-behavior -->

**Independent Test**: Build a catalogue whose entry keeps its id and changes its label between two
renders; assert the study stays in the list with its values intact. Then build two entries sharing an
identity and assert the notice fires.

---

### P1: A study's parameters survive the tab ⭐ MVP

**User Story**: As a user of the workspace, I want the period I typed to still be there after I duplicate
the tab, export the workspace and load it again, so that a value I chose is not a value I have to choose again.

**Why P1**: This is the requirement the owner named, and the only one the host cannot satisfy alone.
`WorkspaceSetup` is a closed shape, `coerceWorkspaceSetup` rebuilds a literal field by field and discards
anything it does not know, and `useWorkspaceSetup`/`useWorkspaceSetupWriter` are not exported.

**Acceptance Criteria**:

1. WHEN a tab carrying per-study parameter values is serialised and parsed back THEN the workspace SHALL restore each study with the same values it was saved with, keyed by the identity IDENT-01 establishes  <!-- event-driven -->
2. WHEN a study's parameter value changes THEN the workspace SHALL keep that study's identity, its lane and its position in the list unchanged  <!-- event-driven -->
3. The package SHALL NOT read, interpret, validate or default any individual parameter value — it stores and returns what the host gave it  <!-- ubiquitous -->
4. IF a stored payload carries a parameter value that the host's coercion rejects THEN the workspace SHALL load that study with no values rather than refusing the whole payload  <!-- unwanted-behavior -->
5. WHEN a stored payload carries parameter values for a study that is no longer in the active list THEN the coercion SHALL drop those values  <!-- event-driven -->
6. WHEN a payload written before this feature is loaded THEN the workspace SHALL load it without error and without a version bump, with every study carrying no values  <!-- event-driven -->
7. WHEN a tab is duplicated THEN the copy SHALL carry the same per-study parameter values as the original  <!-- event-driven -->

**Independent Test**: Serialise a setup with two studies and distinct values, parse it back, assert deep equality; then parse a pre-feature payload and assert it loads with empty values and no throw.

---

### P1: The host draws the parameter form and the library draws the study ⭐ MVP

**User Story**: As a host developer, I want to turn the vendor's `inputConfig` into a form and the
vendor's plots into series, so that the workspace shows a real, editable indicator without this package
ever naming one.

**Why P1**: Without the adapter the persistence has nothing to persist. `WorkspaceSection.Body` already
renders host content inside the studies panel, and `studies.resolve` is already a host function memoised
on the `studies` identity, so editing a value recalculates without a remount.

**Acceptance Criteria**:

1. WHEN the adapter receives a vendor plot point whose value is not finite THEN it SHALL emit a point with no `value`, which this domain reads as a declared gap  <!-- event-driven -->
2. WHEN the adapter maps a vendor result THEN it SHALL take the plot key from that indicator's `plotConfig` rather than assuming `plot0`  <!-- event-driven -->
3. IF a vendor computation throws THEN the workspace SHALL leave every other study drawn and report that one as unavailable  <!-- unwanted-behavior -->
4. WHERE a vendor input is declared but has no effect on the computation the host catalogue SHALL omit it from the form  <!-- optional-feature -->
7. The host catalogue SHALL exclude any vendor entry that returns no plot, and any reachable only through the untyped registry path  <!-- ubiquitous -->
5. The adapter SHALL pass bars ordered ascending by time, because the library performs no validation of its input  <!-- ubiquitous -->
6. WHEN a parameter value changes THEN the workspace SHALL redraw that study without unmounting its series  <!-- event-driven -->

**Independent Test**: Feed the adapter a fixture of 60 bars and a known indicator, assert the warm-up entries are gaps and the drawn entries match the vendor's own output at the same indices.

---

### P2: The example demonstrates the library, and the reversal is recorded

**User Story**: As a visitor to the demo page, I want to see indicators from the real library with
editable inputs, so that the page shows what a host can actually build.

**Why P2**: The example is a host, and AD-006 currently says it authors its own arithmetic. The owner
chose to change that. It is P2 because the package's contract does not depend on it.

**Acceptance Criteria**:

1. WHEN the demo loads THEN it SHALL offer a curated catalogue drawn from the library, excluding entries that return no plot and entries whose reading depends on a fill this package cannot draw  <!-- event-driven -->
2. WHEN a visitor edits an input in the demo THEN the chart SHALL redraw with the new value without the study leaving the list  <!-- event-driven -->
3. The decision log SHALL carry a new entry that supersedes AD-006's example clause, naming what evidence changed  <!-- ubiquitous -->
4. The package SHALL continue to declare exactly two peers and no runtime dependency after the example takes the library as a devDependency  <!-- ubiquitous -->

**Independent Test**: `npm run e2e` — the demo mounts, a study is toggled on, an input is changed, and the legend value changes while the study count stays the same.

---

### P2: A study that did not fit says so

**User Story**: As a user, I want to be told when a study I turned on was not drawn, so that I do not
read an absent line as a broken indicator.

**Why P2**: `laneOrder` cuts from the end of the list at the lane count, and that cut does not appear in
`truncated`, which counts plots inside a lane. `example/App.tsx` records the incident in its own words —
a capacity of six against two lanes let a visitor pick six studies and silently resolved the first two.
A 457-entry catalogue makes a host far likelier to raise `capacity` and forget `lanes`.

**Acceptance Criteria**:

1. WHEN the active list is longer than the lane count THEN the resolution SHALL declare how many studies were cut  <!-- event-driven -->
2. The package SHALL NOT change which studies are cut — the cut stays at the end of the list  <!-- ubiquitous -->

**Independent Test**: Resolve seven ids against three lanes and assert the declared cut is four while the
drawn views are the first three, unchanged.

---

### P2: The wiring is documented where a host will look for it

**User Story**: As a host developer, I want one page that says how to bind a third-party indicator
catalogue, so that the answer is not "read the example's source".

**Why P2**: `docs/how-to/inject-catalogue.md` already exists and says the package ships no catalogue on
purpose. This extends it rather than contradicting it.

**Acceptance Criteria**:

1. The documentation SHALL state that the library's bytes and its words are the host's, and that the package stores parameter values without interpreting them  <!-- ubiquitous -->
2. WHEN the reference is regenerated THEN every new published symbol SHALL appear in it byte-for-byte  <!-- event-driven -->

**Independent Test**: `npx jest test/gates/docReference.spec.ts test/gates/docExamples.spec.ts` passes.

---

### P3: The consuming application uses the same adapter shape

**User Story**: As the owner of the consuming application, I want its indicator wiring to be the same
shape the example demonstrates, so that one of them teaching the other is not a coincidence.

**Why P3**: It lives outside this repository and cannot be gated here.

**Acceptance Criteria**:

1. The application SHALL declare `lightweight-charts-indicators` and `oakscriptjs` in its own manifest  <!-- ubiquitous -->
2. WHEN the application loads the library THEN it SHALL do so behind the user's first request for a study, not at boot  <!-- event-driven -->

---

## Edge Cases

- IF the library fails to load in the host THEN the workspace SHALL mount with an empty study catalogue rather than failing
- IF a stored payload declares parameter values as a non-object THEN the coercion SHALL treat it as absent
- IF a stored identity matches no catalogue entry THEN the workspace SHALL keep it in the list and draw nothing for it, as it does today — a catalogue that shrank is not a corrupt payload
- IF a parameter value is edited while history is still loading THEN the workspace SHALL recompute against whatever bars are present, producing gaps rather than an error
- WHEN the entry bundle is measured after this feature THEN it SHALL remain below `PROVISIONAL_ENTRY_LIMIT`

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| GATE-01 | P1: Boundary gate sees a dynamic import | Design | Pending |
| GATE-02 | P1: Boundary gate sees a dynamic import | Design | Pending |
| GATE-03 | P1: Boundary gate sees a dynamic import | Design | Pending |
| GATE-04 | P1: Boundary gate sees a dynamic import | Design | Pending |
| IDENT-01 | P1: A study is identified by something not on screen | Design | Pending |
| IDENT-02 | P1: A study is identified by something not on screen | Design | Pending |
| IDENT-03 | P1: A study is identified by something not on screen | Design | Pending |
| IDENT-04 | P1: A study is identified by something not on screen | Design | Pending |
| PARAM-01 | P1: Parameters survive the tab | Design | Pending |
| PARAM-02 | P1: Parameters survive the tab | Design | Pending |
| PARAM-03 | P1: Parameters survive the tab | Design | Pending |
| PARAM-04 | P1: Parameters survive the tab | Design | Pending |
| PARAM-05 | P1: Parameters survive the tab | Design | Pending |
| PARAM-06 | P1: Parameters survive the tab | Design | Pending |
| PARAM-07 | P1: Parameters survive the tab | Design | Pending |
| ADAPT-01 | P1: Host draws the form, library draws the study | Design | Pending |
| ADAPT-02 | P1: Host draws the form, library draws the study | Design | Pending |
| ADAPT-03 | P1: Host draws the form, library draws the study | Design | Pending |
| ADAPT-04 | P1: Host draws the form, library draws the study | Design | Pending |
| ADAPT-05 | P1: Host draws the form, library draws the study | Design | Pending |
| ADAPT-06 | P1: Host draws the form, library draws the study | Design | Pending |
| ADAPT-07 | P1: Host draws the form, library draws the study | Design | Pending |
| LANE-01 | P2: A study that did not fit says so | - | Pending |
| LANE-02 | P2: A study that did not fit says so | - | Pending |
| DEMO-01 | P2: Example demonstrates the library | - | Pending |
| DEMO-02 | P2: Example demonstrates the library | - | Pending |
| DEMO-03 | P2: Example demonstrates the library | - | Pending |
| DEMO-04 | P2: Example demonstrates the library | - | Pending |
| DOC-01 | P2: The wiring is documented | - | Pending |
| DOC-02 | P2: The wiring is documented | - | Pending |
| APP-01 | P3: Consuming application | - | Pending |
| APP-02 | P3: Consuming application | - | Pending |

**Coverage:** 32 total, 0 mapped to tasks, 32 unmapped ⚠️ (Tasks phase not yet run)

---

## Success Criteria

- [ ] A synthetic `await import('lightweight-charts-indicators')` under `src/` turns the suite red, and the relative-path control stays green
- [ ] A workspace exported with two parameterised studies and re-imported restores both values exactly
- [ ] A catalogue entry whose label changes while its id does not keeps the study selected and its values intact
- [ ] Two entries resolving to one identity fire the notice instead of the second silently never activating
- [ ] A payload written before this feature loads without error and without a version bump
- [ ] `node scripts/size-gate.mjs` exits 0 and the entry stays below `PROVISIONAL_ENTRY_LIMIT`
- [ ] `test/boundary.spec.ts` still reports zero violations for the three banned specifiers in `src/`
- [ ] `package.json` still declares zero runtime dependencies and exactly two peers
- [ ] `npm test` and `npm run e2e` both green, with the e2e exercising an input edit
