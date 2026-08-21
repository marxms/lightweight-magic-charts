# Indicator library adoption — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path.

**If the skill cannot be activated, STOP and tell the user.**

---

**Design**: `.specs/features/indicator-library-adoption/design.md`
**Status**: In progress — T1 done

---

## Test Coverage Matrix

> Guidelines found: `CONTRIBUTING.md` ("A green `npm run build && npm test`. Paste the counts jest prints", plus `npm run e2e` when the change can reach the page), `jest.config.js` (no coverage threshold; `roots: ['src','test']`; three monorepo-only gates ignored), `.github/workflows/ci.yml` (Node 22/24/26 matrix + a separate Chromium e2e job).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Architectural gate (`test/gates/`, `test/boundary.spec.ts`) | unit | Every clause carries a synthetic POSITIVE CONTROL proving it discriminates, in both directions | `test/gates/*.spec.ts`, `test/boundary.spec.ts` | `npm test` |
| Package seam (`src/tabs/`, `src/indicator/`, `src/catalogue/`) | unit | 1:1 to spec ACs; every listed edge case; round-trip asserted through the real codec | `test/*.spec.ts` | `npm test` |
| React composition (`src/react/`) | unit | Mounted as a HOST mounts it — through `<ChartWorkspace>` with a real `WorkspaceStore` — never through a probe of the hook | `test/*.spec.tsx` | `npm test` |
| Published surface (`src/index.ts`) | unit | Every new symbol appears in the derived reference byte-for-byte | `test/gates/docReference.spec.ts` | `npm run build && npm test` |
| Host adapter + example (`example/`, `scripts/`) | e2e | The drawn result changes when an input changes: a legend value, a `data-testid` counter or a canvas checksum — never screenshot-equals-golden | `scripts/e2e-demo.mjs` | `npm run e2e` |
| Vendor correctness (`scripts/indicator-proof.mjs`) | integration | Every offered indicator draws, is deterministic and pure; every offered input demonstrably moves the output or is in the inert ledger with a written reason | `scripts/indicator-proof.mjs` | `npm run proof` |
| Byte budget / comment budget | none | Build gate only — the gate IS the assertion, and a task that moves 0 B proves it by the gate reporting no change | - | `node scripts/size-gate.mjs` |
| Documentation & decision log | none | Build gate only — `docReference` compares byte-for-byte, `commentBudget` resolves every pointer to a document and a heading | `docs/**`, `.specs/STATE.md` | `npm run build && npm test` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After tasks that can reach the page | `npm run build && npm test && npm run e2e` |
| Build | After a byte delta, a published symbol, or phase completion | `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs` |
| Proof | After tasks touching the vendor catalogue | `npm run proof` |

---

## Execution Plan

Each phase position is forced by a gate, not by preference. The order is derived in `design.md` §
"Execution order, and what it forces".

### Phase 1: The boundary, closed

```
T1
```

### Phase 2: Pay before spending

Nothing that grows may land before these. `S1d` alone leaves the comment aggregate at 0.2001 (RED), so
the trim precedes the shrinkage too.

```
T1 → T2 → T3 → T4
```

### Phase 3: Identity

```
T4 → T5 → T6
```

### Phase 4: The opaque channel

```
T6 → T7 → T8 → T9
```

### Phase 5: The bundler stops lying

```
T9 → T10
```

### Phase 6: The proof

```
T10 → T11 → T12
```

### Phase 7: The host

```
T12 → T13 → T14 → T15
```

### Phase 8: Close

```
T15 → T16 → T17
```

---

## Task Breakdown

### T1: The import guard fails closed ✅

**What**: Teach `importsOf` to capture `import()` and to report any module reference it cannot read as a literal.
**Where**: `test/boundary.spec.ts`
**Depends on**: None
**Reuses**: the existing `ImportRef`/`kindOfImport` shape and the synthetic-source helper already used by the by-name ban
**Requirement**: GATE-01, GATE-02, GATE-03, GATE-04, GATE-05, GATE-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] A dynamic import of a bare specifier is captured with kind `runtime` and judged by the same allow-lists as a static one
- [x] A non-literal reference — template literal, identifier, concatenation — is itself reported, for `import()` and `require()` alike
- [x] Synthetic positive controls assert BOTH directions: the banned name is reported, a relative dynamic import is not
- [x] `grep -rn "import(" src/` still returns nothing, so no existing source changes meaning
- [x] Gate check passes: `npm test`
- [x] Test count recorded, no suite deleted

**Tests**: unit
**Gate**: quick

---

### T2: Give the comment budget its line back

**What**: Delete comment lines that duplicate another comment line in the same file, and write the pick's JSX at the density the line above it already uses.
**Where**: `src/react/workspace/ChartWorkspace.tsx`
**Depends on**: T1
**Reuses**: the density of the neighbouring `<SymbolTrigger …/>` call
**Requirement**: enabling — no requirement of its own; every later task depends on it

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `ChartWorkspace.tsx` is at most 348 code lines, measured by the gate's own counter
- [ ] The comment aggregate leaves at least one line of slack under 0.20
- [ ] No deleted line carries a block's closing marker (two candidates do; deleting them breaks the build)
- [ ] No prose was cut — only exact duplicates within one file
- [ ] `node scripts/size-gate.mjs` shows the entry unchanged: this task moves 0 B
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: none
**Gate**: build

---

### T3: One sentence for every hook mounted outside its provider

**What**: Collapse the four near-identical "was called outside" diagnostics into one exported factory, and give that throw path the discriminating test it never had.
**Where**: `src/react/chrome/labels.ts`
**Depends on**: T2
**Reuses**: the four existing messages at `setupContext.tsx:76,89`, `DrawingRail.tsx:160`, `ChromeContext.tsx:167`
**Requirement**: enabling — pays −319 B toward the feature

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All four call sites read from the factory; no sentence is written twice
- [ ] A test mounts each hook outside its provider and asserts it throws with the provider named — none existed before
- [ ] `size-budget.json` re-pinned DOWN with the measured number and a written reason
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T4: One factory for the rail-tab style

**What**: Collapse the duplicated rail-tab style literals in the series menu into a single factory.
**Where**: `src/react/SeriesMenu.tsx`
**Depends on**: T3
**Reuses**: the two existing literal blocks
**Requirement**: enabling — pays −159 B toward the feature

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] The two literals are one call; rendered output is byte-identical
- [ ] `size-budget.json` re-pinned DOWN separately from T3 — one measured candidate per re-pin
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T5: A study is identified by something that is not on screen

**What**: Add the optional `id` to a catalogue entry, export `studyIdentity`, and make the menu's pressed state and the pick agree on it.
**Where**: `src/react/SeriesMenu.tsx`
**Depends on**: T4
**Reuses**: the existing `chosen` set and `aria-pressed` wiring
**Requirement**: IDENT-01, IDENT-02, IDENT-03

**Tools**:
- MCP: NONE
- Skill: ecc:react-patterns, ecc:react-testing

**Done when**:
- [ ] `studyIdentity(entry) = entry.id ?? entry.label`, and the pressed state compares against it
- [ ] The DOM test id is unchanged, so every existing test id stays where it was
- [ ] A test mounts `<ChartWorkspace>` with a fixture where `id`, `label` and `provider.id` are three different strings, picks, and asserts the chip lights — it does not today
- [ ] A test changes the label while holding the id and asserts the study stays selected
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T6: Two entries cannot share one identity

**What**: Refuse a pick whose identity is already held, reporting it through the notice channel with an optional label and a default.
**Where**: `src/react/workspace/ChartWorkspace.tsx`
**Depends on**: T5
**Reuses**: the `notice.report` path already used by `studyLimit`
**Requirement**: IDENT-04

**Tools**:
- MCP: NONE
- Skill: ecc:react-patterns, ecc:react-testing

**Done when**:
- [ ] The label member is OPTIONAL with a default, so a host that typed the whole group still compiles
- [ ] The labels contract member count moves 85 → 86 in the same commit
- [ ] A test picks the same identity twice and asserts the notice fires and the list does not grow
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T7: The tab holds values it never reads

**What**: Add `StudySettings = unknown`, the optional `studySettings` map on the setup, the optional `coerceStudySettings` sibling, and own-property-only pruning that passes values through when the policy declares nothing.
**Where**: `src/tabs/setup.ts`
**Depends on**: T6
**Reuses**: `coerceIndicators`, which is already the injected migration point
**Requirement**: PARAM-01, PARAM-02, PARAM-03, PARAM-3a, PARAM-04, PARAM-05, PARAM-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Key pruning uses `Object.hasOwn`; a test asserts a study whose key exists only on the prototype chain yields NO value
- [ ] With `coerceStudySettings` absent, values pass through key-pruned rather than being emptied
- [ ] A pre-feature payload loads with no error, no version bump, and empty values
- [ ] Values for a study no longer in the list are dropped
- [ ] The `socketParity` blindness ledger is updated in the same commit
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T8: Editing a value redraws the chart

**What**: Widen `resolve` with an optional third parameter, pass the settings, add them to the memo dependencies, and prove the whole path through a mounted workspace.
**Where**: `src/react/workspace/ChartWorkspace.tsx`
**Depends on**: T7
**Reuses**: the existing `useMemo` over `studies.resolve`
**Requirement**: PARAM-07, ADAPT-06

**Tools**:
- MCP: NONE
- Skill: ecc:react-patterns, ecc:react-testing

**Done when**:
- [ ] A host's existing two-parameter `resolve` still compiles — asserted, not assumed
- [ ] A test mounts `<ChartWorkspace>` with a real `WorkspaceStore` and a host section that writes a value, then asserts the resolve call count rises and carries the value
- [ ] The same test asserts an idle re-render does NOT re-resolve
- [ ] A clause of that test dies if the memo dependency is removed, and a different clause dies if the pass-through is removed — each verified by deletion
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T9: The host gets a door to the setup

**What**: Publish `studyIdentity`, the `StudySettings` type and the two setup hooks, and regenerate the derived reference.
**Where**: `src/index.ts`
**Depends on**: T8
**Reuses**: `scripts/gen-reference.mjs`
**Requirement**: PARAM-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] The three publications appear in the derived reference byte-for-byte, regenerated in the same commit
- [ ] `verify-package-paths.mjs` exits 0
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs`

**Tests**: unit
**Gate**: build

---

### T10: The bundler stops inlining the dynamic import

**What**: Move the example and e2e builds to `outdir` with `splitting: true`, and assert the boot chunk stays small.
**Where**: `scripts/build-example.mjs`
**Depends on**: T9
**Reuses**: the existing esbuild invocation and its pinned version
**Requirement**: APP-02 (enabling), DEMO-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] The same change is applied to `scripts/e2e-demo.mjs` in the same commit — a split build in one and not the other measures nothing
- [ ] A ceiling on the boot chunk's bytes is asserted, so an inlined dynamic module turns red instead of silently costing 62×
- [ ] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full

---

### T11: Every offered indicator is proven, and every offered input is proven to matter

**What**: Land the correctness and parameterisation proof as a script with its own CI job, including the inert-input ledger as an exact set with written reasons.
**Where**: `scripts/indicator-proof.mjs`
**Depends on**: T10
**Reuses**: `example/studies.ts` as the independent counter-implementation; the methodology of `scripts/e2e-demo.mjs` running in its own job
**Requirement**: ADAPT-04, ADAPT-07, ADAPT-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every offered indicator is asserted to draw, to be deterministic, to be pure, and to sit on the declared scale
- [ ] Every offered input is asserted to move the output, or is in the ledger with a written reason; the ledger is an EXACT set and the check discriminates in both directions
- [ ] Bounded-range rules are asserted by exact id with the definition written beside them — never by name pattern, which fired 40 false positives when tried
- [ ] The cross-check against `example/studies.ts` is asserted, and `example/studies.ts` is NOT deleted: it is the oracle
- [ ] No offered control can be given a legal value that makes one recomputation exceed one second
- [ ] A CI job runs it, separate from `npm test`, with the measured runtime recorded
- [ ] Gate check passes: `npm run proof`

**Tests**: integration
**Gate**: proof

---

### T12: The catalogue cannot change behind the check

**What**: Generate the committed catalogue manifest with a verification tier and settle-window per indicator, plus per-indicator value fingerprints, and a re-derivation check that compares values.
**Where**: `scripts/build-indicator-manifest.mjs`
**Depends on**: T11
**Reuses**: the doctrine `size-budget.json` already applies to esbuild — exact version pin, no range
**Requirement**: ADAPT-09, ADAPT-10

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] The manifest carries, per indicator, the tier reached and the bars within which a retroactive indicator settles
- [ ] Fingerprints are digests of computed VALUES, so a vendor upgrade that changes a number turns the check red
- [ ] The vendor version is pinned EXACTLY, not by range
- [ ] The three definitional exclusions are named with their measurement
- [ ] Gate check passes: `npm run build && npm test && npm run proof`

**Tests**: integration
**Gate**: proof

---

### T13: The vendor's numbers become this domain's points

**What**: Write the adapter — plot key from `plotConfig`, each `Point` built from the bar index, non-finite becomes a declared gap, placement from `metadata.overlay`.
**Where**: `example/indicators.ts`
**Depends on**: T12
**Reuses**: the `PlottableSource`/`SeriesProvider` shapes and `example/studies.ts` conventions
**Requirement**: ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-05

**Tools**:
- MCP: NONE
- Skill: ecc:e2e-testing

**Done when**:
- [ ] Each `Point` takes its time from `bars[index].time` and only its value from the vendor, which neutralises the shifted-point class for all of them
- [ ] A non-finite value becomes a point with no `value`
- [ ] The plot key comes from `plotConfig`; `plot0` is never assumed
- [ ] A vendor computation that throws costs one study and nothing else
- [ ] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full

---

### T14: The host draws the form the library refuses to name

**What**: A module-scope `WorkspaceSection.Body` that renders the vendor's `inputConfig` as accessible controls and writes through the published setup writer.
**Where**: `example/studyForm.tsx`
**Depends on**: T13
**Reuses**: `useWorkspaceSetupWriter`, and the five chrome roles for the control obligations
**Requirement**: ADAPT-04, DEMO-02

**Tools**:
- MCP: NONE
- Skill: ecc:react-patterns, ecc:react-testing

**Done when**:
- [ ] `Body` is defined at module scope and the section is never reordered — an inline `Body` loses the caret on the first character
- [ ] Every control has an associated label and its bounds reachable by a screen reader
- [ ] A value the host's own coercion rejects loads the study with no values rather than refusing the payload
- [ ] The `unknown` is narrowed here, in the host, with validation — the package cannot and must not
- [ ] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full

---

### T15: The demo offers the catalogue before the library loads

**What**: Wire the manifest-driven catalogue and the deferred `import()` into the example's workspace mount.
**Where**: `example/App.tsx`
**Depends on**: T14
**Reuses**: the existing `studies` prop and `chrome.sections`
**Requirement**: DEMO-01, DEMO-03, DEMO-04

**Tools**:
- MCP: NONE
- Skill: ecc:e2e-testing

**Done when**:
- [ ] The catalogue lists names from the manifest with the library still unloaded
- [ ] The library loads on the first study, never at boot
- [ ] If it fails to load, the workspace mounts with an empty catalogue rather than failing
- [ ] `package.json` still declares zero runtime dependencies and exactly two peers
- [ ] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full

---

### T16: The page proves an edited input changed the drawing

**What**: Add the e2e assertion that toggling a study and editing its input changes a drawn value while the study count holds.
**Where**: `scripts/e2e-demo.mjs`
**Depends on**: T15
**Reuses**: the script's existing legend-value and `data-testid` counter assertions
**Requirement**: DEMO-02, LANE-02

**Tools**:
- MCP: NONE
- Skill: ecc:e2e-testing

**Done when**:
- [ ] The assertion reads a legend value or a counter, never a screenshot compared to a golden file
- [ ] The study count is unchanged across the edit, proving no remount
- [ ] The churn warning stays silent, proving the `Body` is stable
- [ ] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full

---

### T17: The reversal is written down

**What**: Record AD-019, mark AD-006 superseded on its example clause only, and document the seam where a host will look for it.
**Where**: `.specs/STATE.md`
**Depends on**: T16
**Reuses**: the existing decision table format
**Requirement**: DEMO-03, DOC-01, DOC-02, LANE-01, LANE-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] AD-019 names what changed and by what evidence; AD-006's `src/` clause is stated as standing
- [ ] `docs/how-to/inject-catalogue.md` gains the third-party wiring, including that values are stored and never read
- [ ] The documentation states that `views.length` is the resolved count and the cut is the difference
- [ ] Every doc pointer written in a comment resolves to a document and a heading
- [ ] Gate check passes: `npm run build && npm test && npm run e2e && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs`

**Tests**: none
**Gate**: build
