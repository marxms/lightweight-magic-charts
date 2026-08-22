# Indicator render fidelity — Validation (third pass, post-merge)

**Date**: 2026-08-22
**Spec**: `.specs/features/indicator-render-fidelity/spec.md`
**This pass**: `a57dbb3..4170125` — **22 commits**, branch `feat/indicator-library-adoption`
**Cumulative**: `0480c76..4170125`
**Verifier**: independent sub-agent, third pass (author ≠ verifier). Nothing inherited from
`tasks.md` or from the first two reports. Every attack rebuilt from zero.
**Platform measured**: macOS/arm64, Node v25.9.0, npm 11.15.0

---

## Verdict: ❌ FAIL

Every acceptance criterion in the spec still passes and every gate is green. The FAIL is not about
the spec — it is about **two grounded sensor results inside the range this pass covers**:

1. **A live laundering path in the value ledger** (`L-N3`) that no attack in this repository has
   tried: withdraw a row through the signed withdrawal ledger, then restore it. It returns as a
   *debut* with nothing to answer to. Measured: **310 offered, `--check` exit 0, `npm run proof`
   38/38, zero value declarations, and a tampered digest on file.** Three of the 22 commits in this
   range exist to close laundering holes; this one is still open, and it is *cheaper* than the hole
   the file's own docblock discloses, because it needs no hand-edit of any digest.
2. **A surviving mutant at the merge point** (`M-Y`): the composition order between the package's
   own field overlays and the host's own overlays is asserted nowhere — not by 1524 unit tests, not
   by 96 e2e scenes.

Also recorded, and not a defect: **the state I was asked to verify does not match the tree.**

---

## 0. State discrepancies — measured before anything else

| Claimed | Measured | Evidence |
| --- | --- | --- |
| HEAD `deba8aa` | HEAD **`4170125`** — one commit later | `git rev-parse HEAD` |
| 21 commits `a57dbb3..deba8aa` | 21 confirmed, but **22** to HEAD | `git rev-list --count a57dbb3..HEAD` = 22 |
| version **0.3.1** | version **0.3.2** | `package.json:3`; `git show 4170125 -- package.json` |
| — | `4170125 chore: bump version` changes **only** `package.json`, +1/−1 | `git show --stat 4170125` |

`CHANGELOG.md:7` newest entry is **0.3.1**. There is **no 0.3.2 section** (`grep -n '0\.3\.2'
CHANGELOG.md` → no match). No gate binds the two — `test/gates/packageName.spec.ts:143-144` only
asserts the version is not `0.0.0` and matches `\d+\.\d+\.\d+` — so nothing is red, and a 0.3.2
would publish with an empty changelog. **Not ranked as a blocking gap; recorded so the owner sees
it before merging.**

---

## 1. FOCO 1 — the merge, and the point with no verifier of its own

### 1.1 Both halves of `CanvasSurface.tsx` are independently asserted

The merged file carries both intentions: `scale` reaches `useOverlayFields`
(`src/react/workspace/CanvasSurface.tsx:70`, `:71-73`) and the host's own overlays are merged with
the fielded ones (`:74`).

I reverted each half separately in a temporary worktree and ran the full suite:

| Mutant | What it reverts | Result |
| --- | --- | --- |
| **M-OURS** `:74` → `own === undefined ? fielded : fielded` | this branch's half | ✅ **Killed — 3** in `test/workspaceOverlays.spec.tsx` (`paints the host overlay on the LANE scale it named`, `paints a host overlay that named NOTHING`, `keeps two host overlays apart`) |
| **M-THEIRS** `:70,:71-73` → `scale` dropped | master's half | ✅ **Killed — 4** in `test/chartWorkspace.spec.tsx:2106` (`LIQ-04, LIQ-05 — the density scale on the data seam`) |

So the worry that "reverting master's half kills nothing of ours and vice versa" does **not** hold.
Each half has a live assertion, and master's half is asserted *through* `ChartWorkspace`, which is
the same component `CanvasSurface` sits inside.

### 1.2 The interaction — built and measured, not assumed

Neither side's suite drives both at once, and both do so **on purpose**:

- `test/workspaceOverlays.spec.tsx:60` — `showDensity: false`, with the comment at `:236-237`
  saying the package's own field overlays are switched off so an unfed socket and a fed one are
  told apart by 0 against 1.
- `test/overlayFields.spec.tsx:58` — `useOverlayFields({ ..., showDensity: true, ...props })`
  through `renderHook`, with **no host overlay array at all**.

I therefore mounted the conjunction myself, through a real `<ChartWorkspace>` with a fake engine
recording every `attachPrimitive`, and read the **canvas**, not the call:

| Case | `attachPrimitive` calls | Reading |
| --- | --- | --- |
| A — density OFF, host overlay anchored to the lane | 1, factor **5** | host probe paints at **y=20** (the lane's scale) |
| B — density ON, no host overlay | 1, factor **11** | field records gradients on pane zero |
| **C — BOTH: density ON + global scale + host overlay anchored to the lane** | **2, factors [11, 5]** | field on pane zero **and** host probe at **y=20**. **Neither is lost.** |
| D — both, `scale: {mode:'global'}` | — | constant bin reads **0.155 in both columns** — global normalisation survives the host array |
| E — both, scale omitted (control) | — | constant bin **dims 0.31 → 0.155** — the per-column rule is intact |

**The merge is behaviourally correct at the meeting point.** D and E run in both directions, so the
global mode is not being satisfied by an accident.

### 1.3 What the conjunction is *not* asserted by — two sensor results

| Mutant | `npm test` (1524) | `npm run e2e` (96) | Verdict |
| --- | --- | --- | --- |
| **M-X** `:74` → `own === undefined ? fielded : [...own]` — the package's field overlays are dropped whenever the host supplies its own | **1524 pass** (only the 3 known dist-missing `sizeBudget` false positives) — **SURVIVES** | **95/96** — `FAIL density.toggle-changes-the-canvas — checksum with field on=289147, off=289147` (`scripts/e2e-demo.mjs:516`) | ⚠️ **Killed by exactly ONE scene, and incidentally** |
| **M-Y** `:74` → `[...own, ...fielded]` — the composition order is swapped | **1524 pass — SURVIVES** | **96/96 — SURVIVES** | ❌ **SURVIVING MUTANT** |

**On M-X.** My probe kills it in three places (case C drops to `attached=1 factors=[5]` — the field
vanishes). The repository catches it only because `example/App.tsx:76` always hands a **non-empty**
`studies.overlays` into `:121` while `:143` supplies `density: DEMO_DENSITY` on the same workspace —
so the demo happens to sit permanently in the conjunction. Change the demo to a host with no band
overlays and the last assertion covering this composition disappears. **No unit test covers it at
all.** Ranked as coverage thinness, not as a survivor.

**On M-Y.** Swapping the order changes which of two `behind` overlays occludes the other on the
pane-zero anchor (`src/react/surface/ChartSurface.tsx:242` — an overlay naming nothing falls through
to the pane-zero anchor, which is where the density field also lands). Nothing asserts it, and
**`spec.md` never defines it**: the edge case at `spec.md:194` says only that overlays tying on
z-order keep their order *across redraws*, which M-Y preserves. So this is a surviving mutant **and**
a spec-precision gap — the spec does not say whether a host's overlay draws over or under the
package's own field.

### 1.4 The other five crossings — checked, nothing un-updated

Files both sides changed: `git diff --name-only be75dd6 51065cb` ∩ `... be75dd6 f97761b` = 15 files.
The five with code or assertions:

| File | Ours | Master | Judgement |
| --- | --- | --- | --- |
| `src/react/chrome/labels.ts` | `+duplicateStudy`, `−truncated` (net 0) | `+densityLegend` group (net +2) | ✅ `test/workspaceLabels.spec.ts:63` asserts **87**, re-derived from `DEFAULT_WORKSPACE_CHROME_LABELS` by walking its leaves (`:19`, `:54`), not picked off a side. The comment at `:56-62` was rewritten with the full derivation (85 + 2). Passes. |
| `src/tabs/setup.ts` | `studySettings` restore via `onlyActive` | `floorMode` rides along in `density` | ✅ Orthogonal fields in the same return object. No assertion of either side needed updating. |
| `src/index.ts` | 7 additions | 4 additions | ✅ Both present; `docs/reference/_index.md` regenerated to 308/114/194/54 and the byte gate `test/gates/docReference.spec.ts` passes. |
| `test/boundary.spec.ts` | evasion loop for `import(<var>)`/`require(<var>)` | `+react/DensityLegend.tsx: 'type'` in `DECLARED_IMPURITY` | ✅ Both live; all four boundary mutants red (§4.3). |
| `test/gates/sizeBudget.spec.ts` | untouched | limit → 115629 | ✅ See §4.1. |

**The `coerceIndicators` class of defect does not recur.** All ten stubs in `test/` return arrays:
`workspaceSetup.spec.ts:52`, `densityAbsoluteScaleGuards.spec.tsx:88` (`() => []`, the repaired one),
`studyForm.spec.tsx:59`, `chartWorkspace.spec.tsx:72`, `studySettings.spec.ts:44`,
`workspaceOverlays.spec.tsx:63`, `tabsRegion.spec.tsx:35`, `idleRedraw.spec.tsx:60`. The merged
coercion walks that list at `src/tabs/setup.ts` (`for (const id of indicators)` inside `onlyActive`),
so a non-array stub would throw; none does.

---

## 2. FOCO 2 — the ledger, re-attacked from zero

**Method.** A second temporary worktree with its **own physical copy** of
`node_modules/lightweight-charts-indicators` (7.4 MB), reached through an env-driven shim that can
multiply one indicator's readings, rename it, or make it emit no plots. The real `node_modules` was
never touched. **Instrument calibration: my own driver reproduced all 310 committed digests
byte-for-byte** before any attack — so every number below is measured against the real artefact.

**Control 0**: untouched tree → `--check` exit 0, 310 offered; `npm run proof` 38/38.

### 2.1 The prescribed attacks — all behave

| # | Attack | Result |
| --- | --- | --- |
| **A0** | `wma × 1.0001`, nothing declared | ✅ **RED** — `wma — undeclared: 164192aca8f9… → 042a185abf7c…`; refuses to write |
| **A1** | **bump + tamper + declared re-spelling** (full costume) | ✅ **RED, 2 faults** — `release-with-respelling` **and** `wma — undeclared … under series-scaled-2^-36/sha256/v2`, both digests printed in full |
| **A1b** | **tamper + declared re-spelling, NO bump** | ✅ **RED on the per-id rule ALONE** — this is the decisive one: the fix is not being carried by `release-with-respelling` |
| **A2** | **legitimate re-spelling alone** — new encoding registered, same vendor, nothing tampered | ✅ **GREEN.** Write regenerates **310 of 310** digests with **0 per-id declarations** and one `encodings` entry; `--check` then exit 0 |
| **A3** | declared rename + tamper | ✅ **RED** — `wma-weighted — undeclared: 164192aca8f9… → 042a185abf7c…`; refuses to write |
| **A4** | clean declared rename | ✅ **GREEN** — 310 offered, and the digest is **carried forward byte-identical** under the new id |
| **A5** | past encoding pruned from `ENCODERS` | ✅ **RED** — `unaddressable-encoding`, refuses to write; **still refuses with a tamper hidden under it** |

### 2.2 Combinations nobody had tried

| # | Attack | Result |
| --- | --- | --- |
| **N1** | rename + **deleted** `entries.wma` + tamper | ✅ **RED** — `wma-weighted — vanished-fingerprint`. The *offer* travels with the id, so the debut is not buyable through a rename |
| **N1b** | same, no tamper (does the rule over-fire?) | ✅ RED for the same structural reason — correct: the entry was deleted either way |
| **N2** | **rename + declared re-spelling + tamper** | ✅ **RED** — named under `series-scaled-2^-36/sha256/v2`, the spelling the file is written in |
| **N2b** | rename + declared re-spelling, **no tamper** (control) | ✅ **GREEN** — 310 offered, `--check` exit 0 |
| **N3** | **withdraw, then restore with a tampered value** | ❌ **PASSES EVERY GATE — see below** |

### 2.3 `L-N3` — the finding: a signed withdrawal buys a debut

Two runs, both entirely through sanctioned commands. No digest is hand-edited.

**Step 1 — the row stops being drawable.** The generator detects it and refuses:

```
build-indicator-manifest: REFUSING to write. 1 row(s) the committed manifest offers would be
WITHDRAWN by a rule in this generator, and nothing declares the loss:
  wma — returns no plot series
```

Sign it in `example/indicators/withdrawals.json` with an ordinary sentence, re-run:
**309 offered.** `wma` is now gone from `manifest.json` **and from `fingerprints.json`** (309 entries).

**Step 2 — the row comes back, with different arithmetic.** Nothing is declared:

```
build-indicator-manifest: 310 offered, 147 rejected
--check          -> OK — the committed artefacts are what this generator produces (310 offered)
npm run proof    -> 38/38 passed
value declarations: 0
digest at HEAD : 164192aca8f9463491a64e70482f0cda574c1cfb7309e24a256bf4c13f20a208
digest now     : 042a185abf7c24a992742781737c04882c0370d231bc5f674edfef686f9b2844   <- tampered
```

**Control (the other direction):** the same two steps with **untampered** arithmetic restore the
digest **byte-identical**. So this is specifically a laundering channel, not general instability.

**Root cause**, at `scripts/indicator-proof/value-ledger.mjs:316`:

```js
if (!offers.has(id)) continue;   // "an id the committed manifest does not offer is genuinely new"
```

The docblock states the premise plainly (`value-ledger.mjs:38-41`): *"an id the COMMITTED MANIFEST
still offers and the fingerprint file no longer covers is a proof that vanished … while an id the
committed manifest does not offer is genuinely new and needs no declaration."* A **signed
withdrawal retires the very evidence that rule depends on** — it removes the id from the committed
manifest, so on the next run the id is, by this test, "genuinely new".

**Why this is not the disclosed limitation.** `value-ledger.mjs:73-75` discloses the *hand-edit*
variant — *"deleting the indicator from the manifest AND the fingerprints in one edit, which offers
it back as new at the price of moving a whole catalogue entry."* `L-N3` needs no hand edit: the
generator writes both artefacts itself, twice, and the only human input is one signed sentence in an
append-only ledger that exists to make catalogue shrinkage honest. Reviewer cost is a row leaving in
one commit and returning in another.

**The evidence to close it is already on disk.** After step 2, `withdrawals.json` still names `wma`
(measured). Nothing in `valueLedgerFaults` reads that file — `offered`, `encoding`, `underCommitted`,
`vendor` and `renames` are its only inputs (`value-ledger.mjs:142`). *Diagnosis only; the fix is
another role's.*

### 2.4 Quantisation — both claims reproduced independently

Measured with my own driver (calibrated: 310/310 digests byte-identical to `fingerprints.json`),
using the repo's exact bit-increment ULP nudge (`scripts/indicator-proof.mjs:694-700`):

| Perturbation | Quantised digests moved (of 310) | Unquantised control |
| --- | --- | --- |
| 1, 2, 4, 8, 16 ULP on the eight | **0** | 14 |
| **64 ULP** | **0** | 13 |
| 256 ULP | 3 | 13 |
| 1024 ULP | 4 | 13 |
| uniform rel. 1e-13 | **262** | 310 |
| uniform rel. 1e-12 | **292** | 310 |
| uniform rel. 1e-11 | **309** | 310 |
| uniform rel. 1e-9 | 310 | 310 |
| uniform rel. 2.1e-2 (the `wma` defect class) | **310** | 310 |

Every number the docblock claims (`value-encoding.mjs:52`, `:57-60`) reproduces **exactly** —
including "0 of 310 move under 1, 2, 4, 8, 16 or 64 ULP". The negative control moves 13–14, so the
perturbation genuinely reaches readings. Headroom beyond the claim is roughly two orders of ULP.
**The quantum absorbs cross-platform noise and stays sensitive. Verified.**

**The `**` limitation is written and honest** — `scripts/indicator-proof/value-encoding.mjs:66-71`:
it names the operator, says it cannot be monkey-patched, says the sensor perturbs the eight
functions and not the operator, cites the concrete bite (`10 ** -4` differing between Node builds)
and names the mitigation (the CI Node matrix). Nothing overclaimed.

---

## 3. Discrimination sensor — summary

**Isolation.** Three temporary `git worktree`s under the session scratchpad; `git stash` never used.
Real-tree `git status --porcelain` was **0 bytes before and 0 bytes after**, byte-identical to the
captured baseline; all three worktrees removed with `--force` and pruned; HEAD unchanged at
**`4170125`** on `feat/indicator-library-adoption`.

| # | Mutation | File:line | Result |
| --- | --- | --- | --- |
| M-OURS | host overlays no longer merged | `CanvasSurface.tsx:74` | ✅ Killed — 3 |
| M-THEIRS | `scale` no longer reaches the hook | `CanvasSurface.tsx:70,71-73` | ✅ Killed — 4 |
| **M-X** | field overlays dropped when the host supplies its own | `CanvasSurface.tsx:74` | ⚠️ **Survives `npm test`**; killed by 1 e2e scene only |
| **M-Y** | composition order swapped | `CanvasSurface.tsx:74` | ❌ **SURVIVED both** (1524 + 96/96) |
| A0 | `wma × 1.0001` | vendor registry | ✅ Killed — RED naming the id |
| A1 | bump + tamper + declared re-spelling | vendor + `value-encoding.mjs` + ledger | ✅ Killed — 2 faults |
| A1b | tamper + declared re-spelling, no bump | same | ✅ Killed — per-id rule alone |
| A2 | legitimate re-spelling (counter-direction) | `value-encoding.mjs` | ✅ **GREEN**, 310 regenerated, 0 declarations |
| A3 | declared rename + tamper | vendor + `renames.json` | ✅ Killed — names the new id |
| A4 | clean rename (counter-direction) | `renames.json` | ✅ **GREEN**, digest carried forward |
| A5 | past encoding pruned | `ENCODERS` | ✅ Killed — `unaddressable-encoding` |
| N1/N1b | rename + deleted digest (± tamper) | `fingerprints.json` | ✅ Killed — `vanished-fingerprint` |
| N2 | rename + re-spelling + tamper | all three | ✅ Killed |
| N2b | same, no tamper (counter-direction) | all three | ✅ **GREEN** |
| **N3** | **withdraw, then restore tampered** | `withdrawals.json` + vendor | ❌ **SURVIVED** — 310, `--check` 0, proof 38/38 |
| N3-ctl | withdraw, then restore untampered | same | ✅ digest byte-identical |
| BND-1 | `lightweight-charts-indicators` in `src/` | `src/indicator/availability.ts:1` | ✅ Killed — 5 clauses |
| BND-2 | `import(<variable>)` in `src/` | `src/indicator/availability.ts` | ✅ Killed — 4 clauses, fails **closed** |
| BND-3 | `lightweight-charts-drawing` in `src/` | same | ✅ Killed — 5 clauses |
| BND-4 | `oakscriptjs` in `src/` | same | ✅ Killed — 5 clauses |
| Q1–Q10 | ULP + uniform-relative quantum probes | `value-encoding.mjs` | ✅ every documented number reproduced |

**Depth**: P0-full — **21 behaviour-level mutations**, plus 4 counter-direction controls and 1
instrument calibration.
**Result**: 19 killed · **2 survived** (M-Y, N3) · 1 partial (M-X, single-scene cover) — **FAIL ❌**

---

## 4. Previous-phase invariants — re-derived, not trusted

### 4.1 `PROVISIONAL_ENTRY_LIMIT` — the raise is master's, never ours

| Commit | Value |
| --- | --- |
| `be75dd6` (merge base) | 104994 |
| `a57dbb3` (last verified) | 104994 |
| `51065cb` (**our side, tip before merge**) | **104994** |
| `f97761b` (master) | **115629** |
| `deba8aa`, `4170125` | 115629 |

`git diff a57dbb3 51065cb -- test/gates/sizeBudget.spec.ts` is **empty** — this branch never touched
the file. `git log -G"PROVISIONAL_ENTRY_LIMIT" a57dbb3..51065cb` returns one commit, `773481d`, whose
`--stat` is `.specs/` only (`LESSONS.md`, `validation.md`, `lessons.json`). ✅ **This branch never
raised the ceiling.** Current value at `test/gates/sizeBudget.spec.ts:56` = 115629; entry measured
**106439**, 9190 B of headroom.

### 4.2 No suite deleted, no skip added

- `git diff --diff-filter=D --name-only a57dbb3 HEAD -- test/ scripts/ conformance/ example/ src/` → **empty**.
- No `.skip(`, `.only(`, `xit(`, `fit(`, `xdescribe(`, `fdescribe(` on any added line in the range → **none**.
- Spec files 123 → **126** (+3). Jest suites 120 → **123**, tests 1478 → **1524** (+46). Nothing decreased.

### 4.3 Boundary gate

| Planted in `src/` | Clauses red |
| --- | --- |
| `lightweight-charts-indicators` | **5** |
| `lightweight-charts-drawing` | **5** |
| `oakscriptjs` | **5** |
| `import(<variable>)` | **4**, reported as unreadable — fails **closed** |

### 4.4 Packaging

`package.json` has **no `dependencies` key**; `peerDependencies` = exactly two —
`lightweight-charts >=5.2.0 <6`, `react >=18.0.0 <20`. ✅

### 4.5 The central phase-2 claim survived the merge — measured with my own instrument

Served `example/` with the e2e's own esbuild configuration, drove Chromium, picked **Ichimoku Cloud**
by its catalogue id (`Trend` / `ichimoku`), and histogrammed every canvas pixel under
`[data-testid="workspace-surface"]` before and after. **I did not reuse the e2e's hue list.**

```
NEW HUES (>=300 px, exactly ZERO before the pick)
  rgb(71,163,71)    13427 px   <- Kumo, bullish fill
  rgb(245,71,51)     7917 px   <- Kumo, bearish fill
  rgb(76,154,255)    1425 px   <- plot0  #4c9aff
  rgb(199,146,234)   1316 px   <- plot1  #c792ea
  rgb(38,198,218)    1216 px   <- plot2  #26c6da
  rgb(245,166,35)    1029 px   <- plot3  #f5a623
  rgb(102,187,106)    872 px   <- plot4  #66bb6a

DISTINCT PLOT-POSITION HUES DRAWN: 5     (plot5 #ef5350 = 0 px, correct: Ichimoku has 5 plots)
KUMO: 1 green region, 1 red region
CONSOLE ERRORS: 0
```

**Five lines and a two-coloured Kumo. Confirmed.** Each hue is the host's palette entry for its own
plot position (`example/panes.ts:21`), and each was **exactly zero** before the pick — so five hues
is five plot slots drawn, not one line drawn five times. `manifest.json` independently records
`ichimoku` with **5 plots and 2 fills**.

---

## 5. Gate check — all re-run on the real tree

| Gate | Command | Result |
| --- | --- | --- |
| Build | `npm run build` | exit 0 |
| Quick | `npm test` | **123 suites, 1524 tests, 0 failed, 0 skipped**, exit 0 (run twice) |
| Full | `npm run e2e` | **96/96**, exit 0 |
| Proof | `node scripts/indicator-proof.mjs` | **38/38** in 11.4 s, exit 0 |
| Size | `node scripts/size-gate.mjs` | OK — 16 measurements, entry **106439 / 106439** against a ceiling of 115629, exit 0 |
| Paths | `node scripts/verify-package-paths.mjs` | OK — 7 entries, exit 0 |
| Catalogue | `node scripts/build-indicator-manifest.mjs --check` | OK — **310 offered**, exit 0 |

**Skill gates.** `validate_spec.py` → 0 errors, 0 warnings. `validate_tasks.py` → 0 errors, 3
warnings (the same three judged and accepted in the second pass). `check_commit.py` → every
authored commit in the range passes; the three that do not are GitHub's own
`Merge pull request #13/#14` and `Merge branch 'master'` messages from master's history, not this
line's work.

---

## 6. Spec-anchored acceptance criteria

The `src/` surface this feature owns is unchanged by the ledger commits, and the merge's only `src/`
edits are the two halves judged in §1. Every criterion verified in the second pass still resolves,
and the two that the merge could have moved were re-measured:

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| **FILL-01/02** a fill is drawn between the two drawn lines / against a level | the host's overlay reaches the pane of the study it annotates | `test/workspaceOverlays.spec.tsx:249` — `expect(paintedY(anchored[0])).toBe(20)`; `:256` `toBe(44)`; `:265` `toEqual([20, 44])`. Sensor **M-OURS kills 3** | ✅ PASS |
| **FILL-03** the fill sits beneath the lines it spans | the fill's own z-order is `behind` | `test/bandOverlay.spec.ts:125` — `expect(new BandFillOverlay('anchor').zOrder).toBe('behind')` | ✅ PASS |
| **LINES-03** lines on screen = live plots | equality on the bitmap; inequality at catalogue scale | Re-measured in §4.5: **5 distinct plot hues, each 0 px before the pick**. Catalogue-scale clause: proof case `lines.every-live-plot-has-a-slot-in-the-declared-resource` → **949 live of 1026 declared, 77 dead across 23 rows** | ✅ PASS |
| **PROOF-01/02/02a/03** a dropped or object-shaped channel fails the proof, naming it | indicator + channel named, enumerated from the result | proof cases `channels.every-member-the-result-carries-is-what-the-manifest-declares` (310 rows) and `channels.the-comparison-discriminates-in-three-independent-directions` — three plantings, three different clauses | ✅ PASS |
| **MARK-01/02**, **BAR-01/02**, **POINT-01/02/03**, **REST-01**, **FILL-04/06**, **LINES-01/02/04** | — | unchanged; `git diff a57dbb3..HEAD -- src/` touches only `CanvasSurface.tsx`, `useOverlayFields.ts`, `chrome/labels.ts`, `tabs/setup.ts`, `index.ts`, `overlays/densityField.ts`, `overlays/densityTuning.ts`, `react/Density*.tsx`, `ChartWorkspace.tsx` — none of them a producer for these clauses; all second-pass citations still resolve | ✅ PASS |
| **FILL-05** bounds unresolvable ⇒ not offered | the indicator is withheld | unchanged: the non-offering half still has no producer — 360 of 360 bounds resolve | ⚠️ **PARTIAL — declared, carried, does not block** |
| **NEW — the composition order of package fields vs host overlays** | **not defined anywhere in `spec.md`** | no assertion — **M-Y survives 1524 + 96/96** | ⚠️ **Spec-precision gap** |

**Status**: **22 of 23 rows PASS · 1 PARTIAL (FILL-05, declared) · 1 NEW spec-precision gap
(composition order) · 0 spec ACs failing.**

### Edge cases

All five carry the evidence recorded at `spec.md:199-205` and it still resolves. The z-order tie
edge case (`spec.md:194`) is asserted at `test/overlayBridge.spec.ts:172-208` and is **not** what
M-Y breaks — M-Y keeps the order stable across redraws; it changes *which* order. That distinction
is the spec-precision gap named above.

---

## 7. Ranked gaps

### 1. `L-N3` — a signed withdrawal buys a debut, and a debut launders a value — **Major**

- **Where**: `scripts/indicator-proof/value-ledger.mjs:316` — `if (!offers.has(id)) continue;`
- **Measured**: two runs of the sanctioned generator; step 2 writes a tampered digest with
  **310 offered, `--check` exit 0, proof 38/38, zero value declarations**. Control with untampered
  arithmetic restores the digest byte-identical.
- **Why it matters**: three of the 22 commits in this range exist to close laundering channels, and
  the file's doctrine (`value-ledger.mjs:34-41`) states the closure in terms of an id the committed
  manifest *still offers*. A withdrawal retires that evidence.
- **Not covered by the disclosed limitation** (`value-ledger.mjs:73-75`), which describes a
  hand-edit of two artefacts. This path hand-edits nothing.
- **The information to close it is on disk**: `withdrawals.json` still names the id after the
  restore; nothing in `valueLedgerFaults` reads it.

### 2. `M-Y` — the overlay composition order is asserted nowhere — **Minor, plus a spec gap**

- **Where**: `src/react/workspace/CanvasSurface.tsx:74`
- **Measured**: `[...fielded, ...own]` → `[...own, ...fielded]` leaves `npm test` **1524/1524** and
  `npm run e2e` **96/96** green.
- **Two things at once**: a surviving mutant *and* a spec-precision gap — `spec.md` never says
  whether a host overlay draws over or under the package's own density field.

### 3. `M-X` — the conjunction has one incidental assertion and no unit cover — **Minor**

- **Where**: same line. Dropping `fielded` whenever `own` is present survives all 1524 unit tests
  and dies only at `scripts/e2e-demo.mjs:516` (`density.toggle-changes-the-canvas`).
- **Why it is thin**: that scene only reaches the conjunction because `example/App.tsx:76` always
  supplies a non-empty `studies.overlays`. Both dedicated unit suites scope themselves to one side
  on purpose (`test/workspaceOverlays.spec.tsx:60`, `test/overlayFields.spec.tsx:58`).

### 4. Version / changelog drift — **Cosmetic, but publish-facing**

- HEAD is `4170125`, not `deba8aa`; `package.json` is **0.3.2**; `CHANGELOG.md` newest entry is
  **0.3.1** and there is no 0.3.2 section. No gate binds the two.

---

## 8. Code quality

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ — the four branch commits are one portability fix, two ledger holes and the merge |
| No abstractions for single-use code | ✅ |
| Only touched files required for the task | ✅ |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns | ✅ — the ledger fixes copy the doctrine of `renames.json` and `withdrawals.json` |
| Spec-anchored outcome check | ⚠️ 22/23 PASS, 1 PARTIAL, **1 new spec-precision gap flagged** |
| Every test maps to a spec requirement | ✅ — no unclaimed tests in the diff surface |
| Tests non-shallow / discriminating | ⚠️ **2 surviving mutants** — see §7 |
| Documented guidelines followed | ✅ `CONTRIBUTING.md`, `jest.config.js`, the Test Coverage Matrix at `tasks.md:20-28` |

---

## 9. What is true, and what is limited

### True, and I measured every line of it myself

- **Ichimoku still draws FIVE lines and a TWO-COLOURED Kumo** after the merge — five palette hues
  each at exactly 0 px before the pick, plus a green and a red fill region, 0 console errors.
- **The merge is behaviourally correct at the one point with no verifier**: a host overlay anchored
  to a study pane and the density field with a global scale both attach, each on its own price
  scale, and neither is lost. Measured on the canvas through a real mount, in both directions.
- **Each half of the `CanvasSurface` merge is independently asserted** — 3 tests die for ours, 4 for
  master's.
- **The two ledger holes this range closed are genuinely closed.** A tamper hiding under a declared
  re-spelling is named **with no bump present**, so the catch is the per-id rule and not the
  release-and-respelling rule. A tamper hiding under a declared rename is named under the new id.
  Both counter-directions stay green.
- **The quantum is exactly what the file says it is** — 0 of 310 digests move at up to 64 ULP,
  262 of 310 move at a uniform 1e-13, and the `wma` defect class moves all 310. Every documented
  number reproduced against a calibrated instrument.
- **Nothing regressed.** 1478 → 1524 tests, no suite deleted, no skip added, this branch never
  raised `PROVISIONAL_ENTRY_LIMIT`, entry 106439 under a 115629 ceiling, `dependencies` still
  absent, exactly two peers, boundary gate red for all four planted evasions.

### Limited — read these before merging

**L-N3** — the withdraw/restore laundering path. §2.3, §7.1. **New this pass.**

**L-M-Y** — the overlay composition order is unasserted and undefined by the spec. §7.2.

**L-M-X** — the conjunction has exactly one assertion, and it is incidental to the demo's shape. §7.3.

**L1 (carried)** — a ledger guard is not itself guarded: deleting a guard's call site inside
`build-indicator-manifest.mjs` leaves `npm test`, `npm run proof` and `--check` green. Pre-existing
in kind for all three ledgers.

**L2 (carried)** — `Point.color?` is pinned only by the derived-docs byte gate.

**L3 (carried)** — `Number.isFinite`'s removal in `example/studyMarks.ts` rests on an unasserted
precondition (`Set.has(NaN)` is `true`).

**L4 (carried)** — FILL-05 stays PARTIAL, with 360/360 bounds resolving beside it.

**L5 (carried)** — the alpha correction and the per-bar fill colours remain unit-only claims.

**L6 (carried)** — the catalogue is **310**, not 320, and `withdrawals.json`'s `openQuestion` still
names all ten rows with `withdrawals: []`. **Still an open owner decision.**

**L7 (new, disclosure check)** — the `**` operator is outside the sensor's reach. The limitation is
written at `value-encoding.mjs:66-71`, it is specific, and it names its mitigation. **Honest.**

### Numeric verification seal

**This range re-derived no arithmetic.** The tier definitions are untouched and the counts are
unchanged from the second pass: **pinned 6 · constrained 108 · structural 196**, summing to 310 —
read off `seal:` in the generator's own output on the real tree. `oracle.counter-implementation`
still measures the vendor against this repository's own implementations, unchanged by this range
and not re-derived by it.

Do not write "the seal did not change" without the qualifier. Write: *the tier definitions and the
counts are both unchanged; this range touched rendering composition and the ledger, not arithmetic.*

---

## 10. Requirement traceability update

| Requirement | Previous | New |
| --- | --- | --- |
| FILL-01, FILL-02, FILL-03, FILL-04, FILL-06 | ✅ Verified | ✅ Verified — FILL-01/02 re-measured through the merge |
| FILL-05 | ⚠️ Partial | ⚠️ Partial — unchanged, declared, does not block |
| LINES-01, LINES-02, LINES-03, LINES-04 | ✅ Verified | ✅ Verified — LINES-03 re-measured on the bitmap |
| POINT-01, POINT-02, POINT-03 | ✅ Verified | ✅ Verified |
| MARK-01, MARK-02, BAR-01, BAR-02, REST-01 | ✅ Verified | ✅ Verified |
| PROOF-01, PROOF-02, PROOF-03, PROOF-04 | ✅ Verified | ✅ Verified — proof 38/38 |
| *(new)* overlay composition order | — | ⚠️ **Undefined in the spec, unasserted in the suite** |

---

## Summary

**Overall**: ❌ **Not ready to merge without a decision on §7.1.**

**Spec-anchored check**: 22/23 ACs match the spec-defined outcome · 0 failing ACs · 1 PARTIAL
(declared) · **1 new spec-precision gap**
**Sensor**: 21 injected, **19 killed, 2 survived** (`M-Y`, `L-N3`), 1 partial (`M-X`), plus 4
counter-direction controls and 1 instrument calibration
**Gate**: `npm test` 1524/1524 · `npm run e2e` 96/96 · `npm run proof` 38/38 ·
`size-gate` 106439/106439 under 115629 · `verify-package-paths` OK · `--check` OK (310 offered) —
every one exit 0, all run on the real tree, porcelain byte-identical to the pre-sensor baseline,
HEAD unchanged at `4170125`.

**What works**: everything the spec asks for. The rendering claim, the merge interaction, the two
ledger fixes and the quantum all hold under attacks I wrote myself.

**What blocks**: `L-N3`. The owner can merge with the hole recorded — it costs an attacker two
commits and a signed sentence — but it should be a decision, not an oversight, because it reopens
by a different door the exact channel three commits in this range were written to close.

**Next steps**: (1) decide on `L-N3` — close it or record it in the PR body beside the disclosed
hand-edit limitation; (2) assert the overlay composition order, or say in `spec.md` that it is
deliberately unspecified; (3) give the conjunction a unit test so its only cover is not the demo's
shape; (4) reconcile `package.json` 0.3.2 with `CHANGELOG.md`; (5) carry forward L1–L6 and the
still-open 320 → 310 question.
