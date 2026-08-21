# Project memory

## Decisions

| ID | Decision | Why |
| --- | --- | --- |
| AD-001 | Master is the default branch; work enters through a pull request | Owner's directive. Verifying `default_branch` on the API caught a CI workflow gated on `main`, which meant the branch that ships was never gated |
| AD-002 | The release is driven by the version in the manifest, on merge to master — not by a tag | Publishing on every merge would fail on npm's duplicate refusal, painting routine merges red for the one reason that is not a defect. The version bump is the release act, reviewed in the pull request |
| AD-003 | Tags and GitHub Releases are records written AFTER a successful publish, never triggers | GitHub does not start workflow runs from events raised with the default `GITHUB_TOKEN`, so a tag-triggered release would look configured and never run |
| AD-004 | The demo deploys from the published version, not from master | A page ahead of the package teaches an API `npm install` does not hand you |
| AD-005 | Actions are pinned by commit, not by tag | `release.yml` runs them in the job holding `NPM_TOKEN`; a repointed tag there is a supply-chain compromise |
| AD-006 | **The example clause is SUPERSEDED by AD-019.** The `src/` clause STANDS and is unchanged: the package may not import `lightweight-charts-indicators` or `oakscriptjs`, and `test/boundary.spec.ts` still fails the build on either name, statically or dynamically | An architect refuted the proposal: the page's thesis is that the host computes. The package also carries four defects catalogued in the streamer's own tests and declares `version = "0.4.0"` inside its 0.5.0 `.d.ts`. What survives is the boundary, and the byte measurement behind it: one indicator is ~1,050,000 B against an entry whose limit IS its own measurement under a down-only ratchet |
| AD-007 | The E2E suite drives `playwright-core` directly, in its own CI job | A second test runner would force a browser download three times across the Node matrix for assertions that do not vary by Node |
| AD-017 | The magnet is a control the RAIL draws and the host NAMES — not a published hook, not a prop pair | The rail already draws three fixed controls it authors entirely — cursor, delete-selection, clear-all — each with its glyph from the library and its word from `DrawingToolbarLabels`. The magnet is that same shape, and it is where every charting product puts it. Publishing `useDrawingRail` would freeze ten members of `DrawingRailValue` as public API to hand a host one boolean, and the hook throws outside a provider the host cannot mount, so its only legal call site is `children`, below the chart — the library keeping composition and handing the host the drawing. Executing this hit `propCount`'s ceiling at 12/12 on `DrawingToolbarProps`, forcing the three edit props into one group: the gate producing a better shape rather than being edited. AD-008 is NOT the precedent for handing the control away — it ruled on how many drawing FAMILIES a rail carries, because ten overloaded a 28px strip; it never reached fixed controls |
| AD-018 | A host-supplied reader that returns `null` falls back; one that THROWS refuses | `null` is an answer the port documents — that pane has no widget yet — and refusing on it would reintroduce the very defect the axis lock exists to fix. A throw is a failure to answer, and the only known thrower is `chart.panes()` on a disposed chart; keeping the container would then reach `applyOptions` on that same disposed chart one line below and put the crash back in the page |
| AD-009 | A drawing gesture is SPLIT at the line where engine knowledge begins: the library owns the mechanism, the binding owns one predicate | The proven anchor-drag fix triggers on `hitTestAnchor`, an API of `lightweight-charts-drawing`. Owning the gesture outright would mean importing a drawing engine and breaking the zero-dependency manifest; leaving it to the host means every binding re-derives the same lock. `DrawingLayer.anchorAt?` is the whole of the engine-specific residue |
| AD-010 | The magnet's threshold is a SCREEN distance, not a price distance | A price-unit tolerance means something different at 60 000 than at 0.4, and different again after a zoom. `SeriesHandle.priceToCoordinate` is already on the port, so pixels cost no new port surface |
| AD-008 | How many drawing families a rail carries is the HOST's decision | The rail draws one button per family. Handing it all ten overloaded a 28px strip, and changing the library to absorb that was the wrong lever — it escaped the palette |
| AD-019 | The example ADOPTS `lightweight-charts-indicators` behind a curated adapter it owns; the package still may not name it | Supersedes AD-006 ON ITS EXAMPLE CLAUSE ONLY. What changed is evidence, not taste. "The host computes" is a statement about WHO, not about how well: the vendor's arithmetic was cross-checked against this repository's own hand-written implementations in `example/studies.ts`, read out of the real file and evaluated rather than ported, and it agrees to ~1e-13 across six series with `histogram == macd - signal` exactly zero. The defects AD-006 cited are real and have grown from four to fifteen — but they are metadata and API-surface defects, which argue for a CURATED adapter and against re-deriving 457 indicators by hand: 320 survive the funnel, six are excluded definitionally with their measurement written beside them, and every offered control is proven to move the drawing or is in a ledger with a reason. `example/studies.ts` is NOT deleted: it is the oracle, and the proof fails before anything else runs if it changes shape. The adapter lives in `example/`, the library and its required peer are devDependencies, and the published manifest still declares zero runtime dependencies and exactly two peers |

## Handoff

**indicator-library-adoption: every task is implemented and committed. The independent Verifier has
NOT run yet — that is the next step, and this branch is not done until it reports.**

Branch `feat/indicator-library-adoption`, 17 commits, one per task, no push. `package.json` is
`0.2.1`.

**Green, measured directly and not quoted:** `npm test` 107 suites / 1320 tests · `npm run e2e`
71/71 · `npm run proof` 27/27 in 11.4 s · `node scripts/size-gate.mjs` exit 0, entry **104992**
against a ceiling of 104994 · `node scripts/verify-package-paths.mjs` exit 0 ·
`node scripts/build-indicator-manifest.mjs --check` exit 0.

**What the package gained, and it is only two things:** a study identified by something other than
the text on screen, and a per-tab map of parameter values it stores and is forbidden by the compiler
to read. Everything else — 320 indicators, 1021 controls, the form, the adapter, the loader — is in
`example/`, which is why the entry moved by zero bytes across the whole of phases 7 and 8.

**The reversal is recorded.** AD-019 supersedes AD-006 on its example clause only; AD-006's `src/`
clause stands and `test/boundary.spec.ts` still fails on either vendor name.

**Six follow-ups. None blocks the Verifier; all are the owner's call.**

1. **A chosen study can have no lane because the HEIGHT BUDGET sank it, and nothing says so.**
   Measured on the demo while writing the e2e: six own-lane studies chosen at `heightPx: 620`
   produced six chips and five lane legends. That is `computeLayout` doing its job — price 320 +
   volume 110 + six lanes at 120 does not fit in 620 — but from the reader's side it is
   indistinguishable from a study that computed nothing. It is a different subsystem from the lane
   cut and was deliberately not folded into this feature.
2. **THERE IS NO PUBLISHED NOTICE CHANNEL FOR A HOST, and this is a real API gap — candidate for a
   feature of its own.** `notice.report` is a private member of `WorkspaceBody`
   (`src/react/workspace/ChartWorkspace.tsx:183`); `ChartWorkspaceProps` (`:126-141`) publishes no
   `onNotice`. The channel is the library talking to its own chrome. So **any requirement of the
   form "the host reports X through the notice channel" is not satisfiable today** — LANE-02 was
   written that way, no host could have obeyed it, and it has been rewritten to the cut the host
   derives from `ids.length - views.length` and surfaces in its own vocabulary. The demo removes the
   condition altogether by writing its ceiling and its lane count as ONE symbol, asserted in the e2e
   (`params.the-ceiling-and-the-lane-count-are-one-number`) — and that equality predates this
   feature, so the assertion pins a pre-existing condition rather than recording new behaviour.
   Publishing the door is a seam change: one prop, one contract about what the library may say
   through it, and a decision about whether the host or the library owns the wording. It was NOT
   done here — growing the public surface in the closing hour of a feature with 2 B of entry margin
   is precisely what this project's discipline exists to prevent.
3. **`PROVISIONAL_ENTRY_LIMIT` margin is now 2 B** — entry 104992 against 104994. This feature paid
   for every byte it spent with measured shrinkage, one candidate per re-pin, but the next feature
   starts with almost nothing. Do not raise the ceiling.
4. **`example/indicators.ts` sits beside the `example/indicators/` directory.** Resolution prefers
   the file and both bundlers agree, but the pair reads oddly. Renaming is free and was not done
   because the task named the path.
5. **`test/gates/packaging.spec.ts` is skipped outside the monorepo**, so "zero runtime
   dependencies, exactly two peers" is asserted in `scripts/e2e-demo.mjs` instead — next to the
   bundle it is a claim about. If that suite ever runs here, the two should be reconciled.
6. **`scripts/boot-chunk.mjs` now measures the entry plus the transitive closure of its STATIC
   imports.** The ceilings did not move; the measurement did. Production 707,648 B, development
   1,898,703 B.

**Older, still open, unrelated to this feature:**

1. The price legend labels overlay studies `Study` and shows `—` for unoccupied slots.
2. A lane series is always `shape: 'line'` (`src/catalogue/lanes.ts:38`). Band and cloud indicators
   are excluded from the curated catalogue for exactly this reason; it is the natural next feature.
3. The `ecc-tools/lightweight-magic-charts-1786905841474` branch is still on the remote; PR #3 open.
4. Five Dependabot PRs (#4-#8) open against master.
5. After publish, move to npm trusted publishing and revoke the token.
6. The gates cite AD-011, AD-012 and AD-016, but the decision table jumps from AD-010 to AD-017.
7. `scripts/size-gate.mjs` depends silently on a fresh `dist/` and should say so when it fails.
