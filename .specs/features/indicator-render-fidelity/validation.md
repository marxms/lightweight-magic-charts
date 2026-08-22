# Indicator render fidelity — Validation

**Date**: 2026-08-22
**Spec**: `.specs/features/indicator-render-fidelity/spec.md`
**Diff range**: `0480c76..b2c0082` — 18 commits, 17 tasks, branch `feat/indicator-library-adoption`
**Verifier**: independent sub-agent (author ≠ verifier). Coverage re-derived from the spec and the
diff, evidence-or-zero. Nothing was inherited from `tasks.md`.

---

## Verdict: ❌ FAIL

Every gate is green and the headline claim is **true and verified by eye**: the demo draws five
Ichimoku lines and a two-coloured Kumo. The verdict is FAIL because the discrimination sensor found
**four surviving mutants**, two of them on named acceptance criteria — and one of those is the exact
defect class this feature was created to remove ("77 indicators sit behind a door nobody opened…
nothing is red"). The rebuilt guard for that door is measurably not a guard.

This is a **weak-evidence** FAIL, not a broken-behaviour FAIL. No shipped behaviour is wrong that I
could find. What is wrong is that four behaviours the spec names can be deleted with `npm test`,
`npm run e2e` and `npm run proof` all green.

---

## 1. The central claim, measured with my own instruments

I did not reuse the e2e's hue list. I served `example/` with esbuild, drove Chromium myself, picked
**Ichimoku Cloud**, and histogrammed every canvas pixel under `[data-testid="workspace-surface"]`,
keeping only colours that were **absent before the pick** and present at ≥300 px after it. Then I
clustered them at tolerance 24/channel so antialias shades collapse.

```
NEW HUES (>=300 px, zero before the pick)
  rgb(71,163,71)    13427 px      <- Kumo, bullish fill
  rgb(245,71,51)     8425 px      <- Kumo, bearish fill
  rgb(76,154,255)    1752 px      <- Conversion Line
  rgb(199,146,234)   1316 px      <- Base Line
  rgb(38,198,218)    1216 px      <- Lagging Span
  rgb(245,166,35)    1029 px      <- Leading Span A
  rgb(102,187,106)    872 px      <- Leading Span B

DISTINCT NEW COLOUR CLUSTERS: 7  =  5 lines + 2 fill colours
PRICE LEGEND: "DEMO-USDO 147.48H 149.09L 145.88C 147.49+0.01%149.98153.67149.69134.61"
```

I then rendered a segmentation mask of the live canvas — one paint colour per expected hue, black
everywhere else — and looked at it. **I counted FIVE lines.** Five continuous, separately coloured
curves, plus a shaded band that is **green where Leading Span A is above B and red where it is
below**, bounded above and below by the orange and magenta curves, with the curves drawn *over* the
shading. The colour is the host's (`example/panes.ts` cycles `OVERLAY_COLORS` by plot position), so
five distinct hues is five distinct lines and not one line drawn five times.

**The number I counted is 5.** Not three, not four. The legend shows four readings because the
Lagging Span is displaced 26 bars back and has no value at the right edge — which is why counting
the legend would have been the wrong instrument, and the suite says so at `scripts/e2e-demo.mjs:1325`.

---

## 2. The catalogue: 320 → 310. Judgement.

**What happened.** `scripts/build-indicator-manifest.mjs:283` refuses any row whose vendor result
carries a top-level member the host has nowhere to paint. Ten rows emit one: `plotCandles` on
`madrid-trend-squeeze`, `linear-regression-candles`, `market-shift-levels`, `matrix-series`,
`modified-heikin-ashi`, `super-supertrend`, `banker-fund-flow`; `tables` on `ml-adaptive-supertrend`,
`ml-rsi`, `supertrend-ai-clustering`. I reproduced the refusal by deleting it (sensor M7c): the
generator writes 320 rows again and `channels.no-offered-row-emits-a-channel-nothing-draws` turns
red naming all ten.

**The spec sustains both readings, and they conflict.**

- Reading A (what was built): spec.md:47 — *"An indicator whose channel cannot be drawn is not
  offered."* Under this the implementation is exactly right, and the Goals line survives too, because
  it is scoped to *"Every indicator the catalogue **offers**"* — a smaller offer satisfies it.
- Reading B (what the owner asked): spec.md:14-15 — *"be canonical to the reference implementation
  in every case. What the vendor's own demo draws, this demo draws."*

**The tiebreak is in the spec's own Confirmed column, and it goes against Reading A.**
spec.md:39 defines canonical as *"What the vendor EMITS, not what its demo manages to paint"* and is
marked **Confirmed = y**. spec.md:47, the non-offering clause, is marked **Confirmed = n**. The
vendor *does* emit `plotCandles` and `tables` — its own README (`node_modules/lightweight-charts-indicators/README.md:252`)
advertises them as first-class drawing primitives alongside the seven that were wired. And nothing in
Out of Scope excludes them; the only exclusion there is *"Rendering channels the vendor does not
emit"*, which is the opposite case.

So the refusal was not "this cannot be drawn". It was "**this host has not wired it**".
`plotCandles` is a candlestick series — a `SeriesShape` the package already owns, since the price
series is one. `tables` is chrome. The generator's `unknown` list is a statement about wiring, not
about drawability, and the spec's clause does not make that distinction.

**Verdict on the question you asked**: refusing the ten **complies with the letter of the spec's
weakest, unconfirmed clause and contradicts its strongest, confirmed one**. It is a defensible
fallback, not the canonical answer. It is also a 3.1 % contraction of a catalogue the previous phase
paid for.

**The PR body must offer the owner the choice, in writing.** Two options, with the cost of each:
(a) keep 310 and record the ten as a declared exclusion with a written reason each, the way
`exclusions` already works; (b) wire `plotCandles` (a candle series through the existing overlay/
series seam) and `tables` (host chrome), and restore 320. Shipping (a) *silently* under the banner
"canonical in every case" would misdescribe the result.

---

## 3. FILL-05 stays PARTIAL — and PARTIAL is correct and honest

`spec.md:239-243` records it and explains why. I re-measured the claim independently rather than
trusting it. Over the 310 offered rows at 1,024 bars (fixture A), mirroring `resolveBound`'s five
spellings:

```
offered rows emitting a fill  : 104     (manifest declares fills: 104 — matches)
fills                         : 180
bound references              : 360
resolved                      : 360   (of which hline-bound: 10)
UNRESOLVED                    : 0
fills with a per-bar colors[] : 83
fills with >=1 non-finite bar : 160
```

**360 of 360 bounds resolve.** The clause's second half — *"that indicator SHALL NOT be offered"* —
therefore has no producer anywhere in the catalogue and cannot be given a discriminating control
without inventing one.

The first half **is** asserted and **is** discriminating: `test/bandOverlay.spec.ts:110-111` —
`expect(resolveBound('hline_nowhere', RESULT, 4)).toBeNull()` and
`expect(bandsOf({...RESULT, fills:[{plot1:'plot0', plot2:'hline_nowhere'}]}, 4)).toEqual([])`. Sensor
M15 (drop the hline branch of `resolveBound`) kills two tests.

**Is PARTIAL acceptable for a PR?** Yes — it does not block. It is a clause whose refusal half is
vacuous on this vendor release, it is written down where a reader will find it, and the two
neighbouring refusal clauses that *are* live (LINES-04 width, PROOF-01 undrawable channel) both carry
planted positive controls. What blocks is elsewhere in this report. **FILL-05 should stay PARTIAL in
the PR body, with the 360/360 number beside it** — not quietly promoted to Done.

---

## 4. Spec-anchored acceptance criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| **FILL-01** fill drawn between two drawn plots | shading bounded by both lines | `test/bandOverlay.spec.ts:123` `expect(painted(overlay, RAW)).toEqual([{y:80,h:20,…},{y:80,h:20,…}])`; live e2e `scripts/e2e-demo.mjs:1360` `cloud.kumo-is-shaded` → bullish 13459 / bearish 8425 against 0/0 before; `test/workspaceOverlays.spec.tsx:249` `expect(paintedY(anchored[0])).toBe(20)` | ✅ PASS |
| **FILL-02** bound is a constant level | fill drawn against that level | `test/bandOverlay.spec.ts:88-92` all five spellings, `:104` `expect(painted(overlay,RAW)).toEqual(RAW.map(()=>({y:50,h:110,fill:'#0000ff'})))` | ✅ PASS |
| **FILL-03** fill beneath the lines it spans | the fill's own z-order is `behind` | `test/overlayAnchor.spec.tsx:267` `expect(…paneViews()[0].zOrder()).toBe('bottom')` — but on a **synthetic `ProbeOverlay`**, never on `BandFillOverlay`. **Sensor M16 flips the real fill to `'ahead'` and everything stays green.** | ❌ **GAP — mutant survives** |
| **FILL-04** editing a bound redraws the fill in the same frame | lines and shading move together | `scripts/e2e-demo.mjs:1400` — Leading Span B 52→26: line 1652→2098 px **and** Kumo 13459/8425→3803/1883 px, both required in one predicate | ✅ PASS |
| **FILL-05** bounds unresolvable ⇒ not offered | the indicator is withheld | half asserted (`test/bandOverlay.spec.ts:110-111`); the non-offering half has **no producer** — measured 360/360 bounds resolve | ⚠️ **PARTIAL — correctly declared** |
| **FILL-06 / AC 4a** idle re-render rewrites nothing | writes stay at the mount count | `test/idleRedraw.spec.tsx:235` `expect(afterIdle).toBe(afterMount)`, `:255` `expect(afterLevel).toBe(afterMount)`, control positive at `:277` `expect(afterMove).toBeGreaterThan(afterMount)`. **Sensor M8 → `Expected: 111, Received: 148`** — the author's numbers reproduce exactly | ✅ PASS |
| **LINES-01** every declared line drawn | all lines, not the lane default | `test/indicatorResolution.spec.ts:293` `expect(resolution.views[0].drawn).toBe(5)`; `test/hostSlots.spec.ts:131` unclaimed = `[]` for a 5-plot over-price shape; e2e `:1382` five hues each 0 before the pick | ✅ PASS |
| **LINES-02** count comes from the study | no single number for all studies | `plotsPerLane` deleted from `src/catalogue/sources.ts:29`; `test/indicatorResolution.spec.ts:310` two studies of different widths both resolve whole; `test/catalogueSources.spec.ts:136` | ✅ PASS |
| **LINES-03** lines on screen = live plots | live, not declared | proof `scripts/indicator-proof.mjs:1070` — **949 live of 1026 declared, 77 dead across 23 rows**, every live one inside the declared resource; e2e `:1382` five of five for Ichimoku | ⚠️ **Spec-precision gap** — the catalogue-wide clause asserts *fits ≤ width*, an inequality; the *equality* the spec words is only pinned for Ichimoku |
| **LINES-04** a study that cannot draw whole is not offered | refused at the generator | `test/manifestChannels.spec.ts:151-159` refusal names the row and both numbers; `:141-149` the vacuity is pinned; **sensor M6b (width 56→20) → proof red naming `auto-support: 40 live against a declared 20`** | ✅ PASS |
| **POINT-01** a point's colour reaches its segment | that segment drawn in that colour | `test/pointColors.spec.ts:82-86` alignment by time; `:105-106` archived under the same series id; `test/chartSurface.spec.tsx:815-817` `expect(written[0]).toMatchObject({value:55.4,color:'#ff0000'})` and the two differ | ✅ PASS |
| **POINT-02** colour does not change what a point means | a valueless point stays a gap | `test/pointColors.spec.ts:158-159` `isGap` both ways; `:189-190` the colour survives at the bar that HAS a reading; `test/chartSurface.spec.tsx:796-799` | ✅ PASS |
| **POINT-03** no colour ⇒ the series' own | fall through to the convention | `test/pointColors.spec.ts:150-152` `expect(signed.map(p=>p.color)).toEqual([PALETTE.down,PALETTE.up])` vs `['#ff0000',PALETTE.up]`; `test/chartSurface.spec.tsx:828` `expect(written[1].color).toBeUndefined()`. **Sensor M14 kills 18 tests** | ✅ PASS |
| **MARK-01** markers placed on the bars they name | marks on screen, on the study's own series | Library half: `test/chartWorkspace.spec.tsx:1126` `await waitFor(()=>expect(ledger.markers).toEqual([[MARK]]))` — a **call that was made**. Canvas half: `scripts/e2e-demo.mjs:1441` `up>0 && down>0`. **Sensor M5 deletes the marker plugin from the real engine and the canvas half stays green** | ❌ **GAP — mutant survives** |
| **MARK-02** no marker door ⇒ lines still draw, no marks offered | draw, do not fail | `test/chartSurface.spec.tsx:744-746` `expect(candles?.markerCalls).toEqual([])` **and** `expect(candles?.data.length).toBeGreaterThan(0)` **and** the legend still reads; `test/chartWorkspace.spec.tsx:860` | ✅ PASS |
| **BAR-01** a coloured bar is drawn in that colour | candle body, border and wick | `test/chartSurface.spec.tsx:773` `expect(written[0]).toMatchObject({color:'#9c27b0',borderColor:'#9c27b0',wickColor:'#9c27b0'})`; e2e `:1471` 1865 px against 0 before. **Sensor M17 → unit red + e2e reads 0** | ✅ PASS |
| **BAR-02** colour does not change what a point means | gap stays a gap | `test/chartSurface.spec.tsx:796-799` one plotted point where the reader answered `[55.4,null]`, candles still carrying the colour | ✅ PASS |
| **REST-01** background/label/line/box all draw | each drawn, in its place | `test/channelOverlays.spec.ts:50` `expect(ctx.rects).toEqual([{x:15,y:0,w:10,h:120,fill:'rgba(0,128,0,0.3)'}])` plus 18 more localising cases; e2e `channels.{bgColors,labels,lines,boxes}-draw` → 50147/40432, 2913, 919/846, 8787/11871 px, each 0 before. **Sensor M18 → unit red + e2e reads 0/0** | ✅ PASS |
| **PROOF-01** a dropped channel fails the proof, naming both | indicator + channel named | **Sensor M7**: dropping `ichimoku`'s `fills: 2` → `FAIL channels.every-member-the-result-carries-is-what-the-manifest-declares — 1 divergence(s): ichimoku: emits 2 fills and the manifest declares none` | ✅ PASS |
| **PROOF-02** every emitted member compared, enumerated from the result | not from a written list | `scripts/indicator-proof.mjs:1054` sweeps 310 rows, `scripts/indicator-proof/manifest-shape.mjs:79-94` `Object.entries(result)`; `test/manifestChannels.spec.ts:107` `expect(answer('unnamed').unknown).toEqual(['somethingNobodyWrote'])` | ✅ PASS |
| **PROOF-02a** an object channel counted like any other | same as an array | `test/manifestChannels.spec.ts:99` `expect(seen.unknown).toEqual(['plotCandles'])`. **Sensor M7b** (`Array.isArray` only) → proof red: `object-shaped→red false`, the other two still true | ✅ PASS |
| **PROOF-03/04** three plantings, each discriminating alone | one clause each | `scripts/indicator-proof.mjs:1108` prints all five directions; M7, M7b and M6b each turned exactly one of them red while the others stayed true | ✅ PASS |

**Status**: 20 of 23 rows PASS · **2 GAPS (FILL-03, MARK-01)** · 1 PARTIAL (FILL-05, declared) ·
1 spec-precision gap (LINES-03).

### Edge cases

| Edge case (spec.md:192-196) | Evidence | Result |
| --- | --- | --- |
| non-finite bound ⇒ fill interrupted, not spanned | `test/bandOverlay.spec.ts:123` two of four bars painted, control at `:133` all four; **sensor M2 kills 2** | ✅ |
| lane grows rather than the study being cut | `test/hostSlots.spec.ts:131-152` incl. two positive controls; **sensor M9 → e2e 93/96, Leading Span A and B read 0 px** | ✅ |
| two overlays claiming the same z-order ⇒ order stable across redraws | **no test found anywhere in `test/`** | ❌ **no evidence** |
| a marker outside the loaded window is dropped without affecting the rest | `example/studyMarks.ts:45-50` narrows shape/position/colour and a non-finite time — **it does not check the window at all**, and there is **no test file for `studyMarks.ts`** | ❌ **no evidence** |
| entry stays below `PROVISIONAL_ENTRY_LIMIT` | `test/gates/sizeBudget.spec.ts:557` `expect(BUDGET.entry.limit).toBeLessThan(PROVISIONAL_ENTRY_LIMIT)`; measured 104853 < 104994 | ✅ |

---

## 5. Discrimination sensor

**Isolation**: a temporary `git worktree` at `b2c0082` under the session scratchpad, with
`node_modules` symlinked. `git stash` was never used. Baseline `git status --porcelain` of the real
tree was **empty** before the sensor and is **empty** after; `git worktree remove --force` ran clean;
HEAD is unchanged at `b2c0082`. Scratch re-verified green (119/1449) before removal.

**Depth**: P0-full — 25 behaviour-level mutations, every acceptance criterion and every new
published member touched.

| # | Mutation | File:line | Result |
| --- | --- | --- | --- |
| M1 | `alignColors` always returns `null` | `src/indicator/availability.ts:60` | ✅ Killed — 4 tests (POINT-01/02 + the optional-map clause) |
| M2 | non-finite bound spans the gap instead of interrupting | `example/bandOverlay.ts:188-190` | ✅ Killed — 2 |
| M3 | `fills[].colors` ignored (the reference's collapse) | `example/bandOverlay.ts:142-146` | ✅ Killed — 1 unit. **e2e blind: 96/96** |
| M3b | the two Kumo fills collapse into one colour | `example/bandOverlay.ts:147-149` | ✅ Killed — **e2e 94/96**, `kumo-is-shaded` reads bullish 21900 / bearish **0**; + 2 unit |
| M4 | the reference's alpha defect, `'#43A047' + '5a'` | `example/bandOverlay.ts:74-85` | ✅ Killed — 4 unit. **e2e blind: 96/96** (see precision note) |
| **M5** | **marker plugin removed from the real engine** | `example/engine.ts:124` | ❌ **SURVIVED** — test 1449/1449, e2e **96/96**, proof 33/33 |
| M6 | committed width `overPrice` 56→55 | `example/indicators/manifest.json` | ✅ Killed — 2 unit. Proof blind at 55 |
| M6b | committed width `overPrice` 56→20 | same | ✅ Killed — proof red: `auto-support: 40 live against a declared 20` |
| M7 | `ichimoku`'s `fills: 2` declaration dropped | same | ✅ Killed — proof names indicator + channel |
| M7b | `channelsOf` blind to object channels | `scripts/indicator-proof/manifest-shape.mjs:84` | ✅ Killed — proof + unit |
| M7c | generator's undrawable-channel refusal removed | `scripts/build-indicator-manifest.mjs:283` | ✅ Killed — proof names all ten restored rows |
| M8 | T17 `useMemo` over the readers reverted | `src/react/workspace/ChartWorkspace.tsx:218` | ✅ Killed — `Expected 111, Received 148`; + danglingRef gate |
| M9 | `resolveSources` truncates at three lines again | `src/indicator/resolution.ts:139` | ✅ Killed — **e2e 93/96**, Leading Span A **0 px**, B **0 px**; + 4 suites |
| M10 | `Overlay.anchor?` deleted | `src/extension/plugins.ts:36` | ✅ Killed — 23 suites |
| M11 | `Point.color?` deleted | `src/domain/types.ts:41` | ⚠️ Killed — **by ONE test, and it is a docs-byte gate** (`test/gates/docReference.spec.ts`). `tsc -p tsconfig.example.json` still exits 0 |
| M12 | `SourceResolution.colors?` deleted | `src/indicator/resolution.ts:51` | ✅ Killed — 10 suites |
| M13a | banned vendor import planted in `src/` | `src/indicator/availability.ts:1` | ✅ Killed — 5 boundary clauses |
| M13b | `import(<variable>)` planted in `src/` | `src/indicator/availability.ts` | ✅ Killed — 4 clauses, reported as `<unreadable module reference>` |
| M14 | POINT-03 fallback removed | `src/domain/readings.ts:53` | ✅ Killed — 18 tests |
| M15 | FILL-02: `hline` bounds no longer resolve | `example/bandOverlay.ts:123` | ✅ Killed — 2 |
| **M16** | **band fill `zOrder` `'behind'` → `'ahead'`** | `example/bandOverlay.ts:159` | ❌ **SURVIVED** — test 1449/1449, e2e 96/96 |
| M17 | per-bar candle colour dropped | `src/react/surface/useSeriesData.ts:104` | ✅ Killed — unit + e2e reads 0 |
| M18 | `bgColors` channel dropped | `example/channelOverlays.ts:124` | ✅ Killed — unit + e2e reads 0/0 |
| M19 | generator withdraws 26 rows (`id` starts with `a`) | `scripts/build-indicator-manifest.mjs` | ⚠️ Killed **incidentally** — only because `auto-support` is the widest row and one pinned row left |
| **M19b** | **generator withdraws 3 ordinary rows** (`bop`, `mass-index`, `momentum`) | same | ❌ **SURVIVED** — 307 rows written, test 1449/1449, e2e 96/96, proof 33/33 |
| **M20** | **the whole vendor-marker narrowing deleted** | `example/studyMarks.ts:45-50` | ❌ **SURVIVED** — test 1449/1449, e2e 96/96 |

**Result: 25 injected · 21 killed · 4 survived — ❌ FAIL**

### M5, diagnosed and dated

The author's T11 note claims *"taking `withMarkers` back out of `example/engine.ts` puts both back to
0 and turns `marks.reach-the-bars` red."* That was **true when written and is false now**. I
bisected it by re-running the same deletion at each commit:

| Commit | Task | `withMarkers` deleted → `marks.reach-the-bars` |
| --- | --- | --- |
| `39d5083` | T11 the marker door | up **0**, down **0** → **RED** (78/79) |
| `7a61096` | T12 bar colours | up **0**, down **0** → **RED** (81/82) |
| `37b1190` | **T13 point colours** | up **5764**, down **5612** → **GREEN** (82/82) |
| `b2c0082` | HEAD | up **5764**, down **5612** → **GREEN** (96/96) |

**Cause, measured on the vendor result.** `realtime-volume-bars` emits markers in `#FF0000`/`#00FF00`
**and** plot point colours in the same two hues — `plots.plot0` is entirely `#00FF00` and
`plots.plot1` entirely `#FF0000`. The e2e counts `MARK_UP = [0,255,0]` and `MARK_DOWN = [255,0,0]`
(`scripts/e2e-demo.mjs:1419-1420`), so from T13 onward it is counting POINT-01's channel as well as
MARK-01's. The predicate is `up > 0 && down > 0` — an existence test on a hue two channels write.
T13 disarmed the marker sensor and nobody re-ran T11's own deletion control afterwards.

### M16, and why it is a clean miss

Every other overlay in this repository pins its z-order at the object:
`test/densityField.spec.ts:60` `expect(new DensityFieldOverlay().zOrder).toBe('behind')`,
`test/troughProfile.spec.ts:211` the same for `TroughProfileOverlay`, and
`test/channelOverlays.spec.ts:262,273` for T14's four channels. **`BandFillOverlay` is the only one
without it** — and it is the one FILL-03 is literally about. The FILL-03 test asserts the *seam*
(`Overlay.zOrder → BaseZOrder`, both directions) on a synthetic probe, which is a correct test of a
different thing. Under M16 the canvas does change measurably (Kumo 13459/8425 → 17777/11474, lines
2910 → 3042) — the signal is there; no assertion reads it.

### M19b, and what it means for 320 → 310

T15 added `if (refused.has(row.id)) continue;` (`scripts/build-indicator-manifest.mjs:329`), which
exempts rows the generator itself turned down from the vanished-id refusal. The reasoning is sound —
a rule the generator applied is not an ambiguous rename-vs-removal. But the exemption removed the
**only ratchet on catalogue size, and nothing replaced it.** Nothing anywhere pins the offered-row
count. M19b withdraws three ordinary indicators and all three gates stay green; the only trace is a
`WITHDRAWING` line on stderr that nothing asserts. M19 was killed only by luck — it happened to take
`auto-support`, the widest row, and one of the six pinned rows.

The previous phase's own doctrine applies verbatim: the generator refuses a vanished id *"because it
cannot tell a rename from a removal **and a host's saved workspace can**"*. A host's saved workspace
loses `bop` exactly as hard whether the id vanished or was withdrawn.

---

## 6. Gates — all re-run by me, all exit 0

| Gate | Command | Result |
| --- | --- | --- |
| Build | `npm run build` | exit 0, `finalise-esm: 233 specifier(s) completed` |
| Quick | `npm test` | **119 suites, 1449 tests, 0 failed, 0 skipped**, exit 0 |
| Full | `npm run e2e` | **96/96 passed**, exit 0 |
| Proof | `npm run proof` | **33/33 passed** in 10.4 s, exit 0 |
| Build | `node scripts/size-gate.mjs` | OK — 16 measurements, entry **104853 / 104853**, exit 0 |
| Build | `node scripts/verify-package-paths.mjs` | OK — `files[]` and `exports` both resolve (7 entries), exit 0 |

**Test integrity.** Measured at `0480c76`: **107 suites / 1323 tests**. At `b2c0082`: **119 / 1449**.
Delta **+12 suites, +126 tests**; nothing decreased. e2e 71 → 96; proof 29 → 33.
`git diff --diff-filter=D --name-only 0480c76..b2c0082 -- test/ scripts/ conformance/` is **empty** —
no suite deleted. No `.skip`, `.only`, `xit`, `fit` or `xdescribe` added anywhere in the range; the
one grep hit in the tree is a string literal inside a language-gate fixture
(`test/gates/language.spec.ts:109`).

---

## 7. Previous-phase invariants — re-derived, not trusted

| Invariant | Measurement |
| --- | --- |
| `PROVISIONAL_ENTRY_LIMIT` never raised | `test/gates/sizeBudget.spec.ts:48` = **104994**; `git diff 0480c76..b2c0082 -- test/gates/sizeBudget.spec.ts` touches only a comment. `git log -G` over all refs finds one commit that raises it to **115629** — `57c30cd`, on branch **`feat/density-absolute-scale`**, which `git merge-base --is-ancestor 57c30cd HEAD` reports **NO**. Not on this branch, not in this range. ✅ **Flag for the owner: that other branch does raise the ceiling.** |
| Entry below the ceiling | 104853 measured = 104853 pinned, `ratchet: down-only`, zero slack; ceiling 104994, max legal pin 104993 → **140 B** of headroom. ✅ |
| `dependencies` absent, exactly two peers | `package.json` has **no `dependencies` key**; `peerDependencies` = `lightweight-charts >=5.2.0 <6`, `react >=18.0.0 <20`. Both `optional: false`. ✅ |
| Boundary gate red for the three banned names | **Sensor M13a** — a real `import { indicatorRegistry } from 'lightweight-charts-indicators'` in `src/` turns 5 clauses red, naming the file. ✅ |
| Boundary gate red for `import(<variable>)` | **Sensor M13b** — `return import(name)` in `src/` turns 4 clauses red as `<unreadable module reference>`; the guard fails **closed**. ✅ |
| `Overlay.anchor?` kills a test if deleted | **M10** — 23 suites. ✅ |
| `Point.color?` kills a test if deleted | **M11** — **one test, and it is a docs-byte gate.** The behaviour tests build points with `as unknown as Point`, and `tsc -p tsconfig.example.json --noEmit` still exits 0. ⚠️ Killed, weakly. |
| `SourceResolution.colors?` kills a test if deleted | **M12** — 10 suites. ✅ |
| `ChartWorkspace.tsx` under 350 code lines | **349**, measured with the gate's own `codeLines` counter. ✅ |
| Comment budget | **1825 / 9134 = 0.19980** against a ceiling of 0.20, measured with the gate's own totals. `floor(0.20 × 9134) = 1826` ⇒ **1 comment line of slack, repository-wide.** ✅ |

---

## 8. The two declared deviations — judged

**T13 touched `example/indicators.ts`, outside its `Where`.** The edit is **7 lines**: `color?` added
to `VendorPoint`, and `toPoints` preserving it instead of dropping it. **Correct, not scope creep.**
It is the producer half of the channel; without it `alignColors` would never see a colour and
POINT-01, POINT-02 and POINT-03 would all pass over an empty set — the precise failure mode this
whole feature exists to remove. It stays in the host, adds 0 bytes to `src/`, is declared in
`tasks.md`, and is the minimum edit that makes the clause non-vacuous. A `Where` field is an
advisory pointer, not a contract.

**`dropped` became `channels`.** **Breaks nobody.** `git grep` at `0480c76` finds **zero** readers of
the field in `src/`, `example/`, `test/` or `scripts/`; `ManifestRow`
(`example/studyValues.ts:37-48` at `0480c76`) never declared it. And `example/indicators/manifest.json`
is not published — `package.json` `files` is `["dist","conformance","LICENSE","NOTICE"]`. The rename
is also a genuine improvement in meaning: the same numbers went from "what was thrown away" to "what
must be drawn", which is what makes PROOF-02's comparison possible at all.

---

## 9. Precision notes the owner should have

1. **The Kumo is not bicoloured by `fills[].colors`.** `spec.md:40` and T10 both state that the
   reference *"ignores `fills[].colors` and collapses 86 of 186 bicoloured fills, **including the
   Ichimoku Kumo***". Measured on the vendor result: Ichimoku emits **two separate fills**, each with
   its own `options.color` (`#43A047 transp 90` and `#F44336 transp 90`), and **neither carries a
   `colors` array at all** (`colorsLen: null` on both). The Kumo is bicoloured on screen — I saw it —
   but not by the mechanism the spec names. This is why sensor M3 (ignore `fills[].colors`) left the
   e2e at 96/96 while M3b (collapse the two fills) turned it red. Narrative error, not a defect.
2. **The alpha correction has no canvas control.** M4 reproduces the reference's exact defect and the
   e2e stays 96/96 — a canvas keeps colour premultiplied and `getImageData` divides the alpha out, so
   the returned RGB is unchanged. Only `test/bandOverlay.spec.ts:52-63` can see it. Fine, but it means
   "35 % where PineScript asks 10 %" is a unit-level claim, not a pixel-level one.
3. **`fills[].colors` pass-through is unit-only too.** M3 kills exactly one test and no e2e check.
4. **The seal numbers DID move.** At `0480c76`, 320 rows: **pinned 6 · constrained 111 · structural
   203**. At `b2c0082`, 310 rows: **pinned 6 · constrained 108 · structural 196**. The *methodology*
   is unchanged and this phase re-derived no arithmetic — but the counts fell by exactly the ten
   withdrawn rows (3 constrained, 7 structural). The **pinned tier is unchanged at 6**. Stating "the
   seal did not change" in the PR would be wrong; state the tier definitions did not change.
5. **My fill measurements differ slightly from the task notes** because the notes were taken over
   320 rows and the artefact now has 310: bounds resolved 360/360 (T10 said 247/247 over the whole
   registry), hline-bound references 10 (T10 said 14), per-bar-coloured fills 83 of 180 (T10 said 86
   of 186), interrupted fills 160 of 180 (T10 said 171 of 186). Same conclusions, different scope.
6. **My marker pixel counts differ from T11's.** T11 recorded 17,274 / 9,974; I measure 19,516 /
   14,117 at HEAD. The difference is T13's point colours landing in the same two hues — the same
   cause as M5.

---

## 10. Code quality

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ — the four channel overlays and the fill live in `example/`, 0 B in the package |
| No abstractions for single-use code | ✅ — `refusalsOf(rows, widths)` is a function of both precisely so it has two callers |
| Only touched files required for the task | ⚠️ — one declared deviation (T13 → `example/indicators.ts`), judged correct above |
| Didn't "improve" unrelated code | ✅ — Phase 1's four refactors are budget payment, each measured and re-pinned separately |
| Matches existing patterns | ✅ — the overlay seam, the manifest-refusal doctrine and the positive-control style all follow the two previous phases |
| Would a senior engineer approve? | ⚠️ — yes on the behaviour, no on the evidence for MARK-01 and FILL-03 |
| Tests map to ACs and are non-shallow | ⚠️ — mostly yes and often exemplary (`test/hostSlots.spec.ts` carries two planted positive controls); `marks.reach-the-bars` is the exception and it is shallow in the precise sense the repo's own matrix forbids |
| Spec-anchored outcome check | ⚠️ — 20/23 match; 2 gaps, 1 spec-precision gap |
| Every test maps to a spec requirement | ✅ — no unclaimed tests found in the diff surface |
| Documented guidelines followed | ✅ `CONTRIBUTING.md`, `jest.config.js`, the Test Coverage Matrix in `tasks.md:20-28` — the last of which is exactly what MARK-01 violates: *"a call that was made is not a thing that was drawn"* |

---

## 11. Ranked gaps → fix tasks

### Fix 1 — MARK-01 has no discriminating canvas evidence · **Blocker**
- **Root cause**: `scripts/e2e-demo.mjs:1419-1420` counts hues (`#00FF00`, `#FF0000`) that
  `realtime-volume-bars` writes from **two** channels — its markers and its plot point colours. The
  predicate `up > 0 && down > 0` therefore cannot fail on the marker channel alone. Introduced by
  T13 (`37b1190`); T11's own deletion control was never re-run after it.
- **Where**: `scripts/e2e-demo.mjs:1415-1447`
- **Fix**: either (a) drive a study that emits markers and **no** coloured plot points — verify by
  enumerating `plots[*][*].color` on the candidate first — or (b) keep the study and assert the
  **delta**: capture the hue counts with the study drawn and the marker map empty, and require a
  strict increase. Then re-run the T11 control (`return created;` in `example/engine.ts:124`) and
  confirm red.
- **Done when**: deleting `withMarkers` from `example/engine.ts` turns `npm run e2e` red.

### Fix 2 — `example/studyMarks.ts` is entirely untested · **Major**
- **Root cause**: no test file imports it. `markOf`'s shape allow-list, position allow-list, required
  colour and non-finite-time rejection can all be deleted (M20) with every gate green; so can
  `markChannel`'s resolution-identity cache, which the docblock says exists to avoid resending ~7,400
  marks per render.
- **Where**: new `test/studyMarks.spec.ts`
- **Done when**: M20 (delete the narrowing) turns `npm test` red, and a mark whose `time` is not a
  bar in the loaded window is asserted dropped with its neighbours intact — closing the spec edge
  case at `spec.md:195`, which currently has no implementation and no test.

### Fix 3 — FILL-03: `BandFillOverlay.zOrder` is unpinned · **Major**
- **Root cause**: the FILL-03 test asserts the seam on a synthetic `ProbeOverlay`; the production
  fill's own z-order is never read. Both sibling overlays and all four T14 channels do have that
  assertion.
- **Where**: `test/bandOverlay.spec.ts`
- **Fix**: one line — `expect(new BandFillOverlay('anchor').zOrder).toBe('behind')`, matching
  `test/densityField.spec.ts:60`. Stronger still: assert on the e2e that the five line hues do **not**
  gain pixels when the Kumo is drawn.
- **Done when**: M16 turns `npm test` red.

### Fix 4 — the catalogue can shrink with every gate green · **Major**
- **Root cause**: `scripts/build-indicator-manifest.mjs:329` exempts self-refused rows from the
  vanished-id refusal, and nothing else pins the offered-row count. M19b withdraws three ordinary
  indicators; 1449/1449, 96/96, 33/33.
- **Where**: `test/manifestChannels.spec.ts` or `scripts/indicator-proof.mjs`
- **Fix**: a down-only ratchet on the offered-row count, or — better, and matching the existing
  doctrine — require every withdrawn row to carry a written reason in a committed ledger, exactly as
  `exclusions` already does for the six definitional exclusions. That also converts the ten
  `plotCandles`/`tables` withdrawals from a side effect into a signed decision.
- **Done when**: withdrawing any offered row without a ledger entry turns a gate red.

### Fix 5 — 320 → 310 must be an owner decision in the PR body · **Major, documentation**
- See §2. The confirmed definition of "canonical" (spec.md:39, Confirmed = **y**) is *what the vendor
  emits*; `plotCandles` and `tables` are emitted and are advertised by the vendor as supported
  drawing primitives. The refusal rests on spec.md:47, Confirmed = **n**.
- **Fix**: write both options and their cost into the PR body and let the owner choose. Do not ship
  "canonical in every case" and a 3.1 % smaller catalogue in the same sentence without saying so.

### Fix 6 — spec edge case with no evidence: stable z-order across redraws · **Minor**
- `spec.md:194`. No test anywhere. Two overlays sharing `'behind'` currently keep the array order they
  were given; nothing asserts it survives a redraw.

### Fix 7 — LINES-03 spec-precision gap · **Minor**
- The spec words an **equality** ("the number of lines on screen SHALL equal the number of its plots
  that produce a finite value"); the catalogue-wide clause asserts an **inequality** (every live plot
  *fits* the declared resource). Pixel-level equality exists only for Ichimoku's five. Either narrow
  the spec's wording to what is measurable at catalogue scale, or add a second pixel-counted study.

### Fix 8 — narrative corrections · **Minor, documentation**
- `spec.md:40` and T10: the Kumo is bicoloured by **two fills**, not by `fills[].colors`. Correct the
  sentence or drop the Kumo from that example.
- The seal moved 6/111/203 → 6/108/196. Say so.

---

## 12. Requirement traceability update

| Requirement | Previous | New |
| --- | --- | --- |
| FILL-01, FILL-02, FILL-04, FILL-06 | Done | ✅ Verified |
| **FILL-03** | Done | ❌ **Needs Fix** — asserted at the seam, not at the fill; mutant survives |
| FILL-05 | Partial | ⚠️ Partial — correct and honest, 360/360 bounds resolve; keep Partial |
| LINES-01, LINES-02, LINES-04 | Done | ✅ Verified |
| LINES-03 | Done | ⚠️ Verified with a spec-precision gap |
| POINT-01, POINT-02, POINT-03 | Done | ✅ Verified |
| **MARK-01** | Done | ❌ **Needs Fix** — canvas evidence non-discriminating since `37b1190` |
| MARK-02 | Done | ✅ Verified |
| BAR-01, BAR-02 | Done | ✅ Verified |
| REST-01 | Done | ✅ Verified |
| PROOF-01, PROOF-02, PROOF-03, PROOF-04 | Done | ✅ Verified |

---

## 13. What is true, and what is limited

**True, and I measured it myself:**
- Ichimoku draws **five** lines and a **two-coloured** Kumo, the fill sits under the lines, and
  editing Leading Span B moves the line (1652 → 2098 px) and the shading (13459/8425 → 3803/1883 px)
  together.
- The four "remaining" channels draw on the real bitmap, each with a zero-before control.
- Per-bar candle colours draw (1865 px in `#9C27B0` against 0).
- Point colours reach their segments, and a point with no colour keeps the series' convention.
- The proof turns red, naming the indicator and the channel, when a declaration is dropped; it counts
  an object-shaped channel like an array one; it refuses a resource narrower than the catalogue.
- An idle re-render writes nothing (111 at mount, 111 after; 148 without the memo).
- `src/` gained no third-party byte: boundary gate red for all three vendor names and for a
  variable-specifier dynamic import.

**Limited, and the owner will hit these:**
- **Markers are drawn but not guarded.** The plugin works — you will see marks. Delete it and nothing
  turns red. `example/studyMarks.ts` has no tests at all.
- **The fill's z-order is not guarded.** Paint it over the lines and nothing turns red.
- **The catalogue can shrink silently.** No ratchet on the offered-row count.
- **The catalogue is 310, not 320**, and that is a choice made under an unconfirmed spec clause.
- **The alpha correction and the per-bar fill colours are unit-only claims** — no canvas control.
- **Two spec edge cases have no evidence**: stable z-order across redraws, and a marker outside the
  loaded window (which is also unimplemented).
- **`Point.color?` is pinned only by the derived-docs gate**, not by a behaviour or a type check.

**Numeric verification seal — unchanged in method, moved in count.**
Tier definitions are untouched by this phase, which is about rendering rather than arithmetic. The
counts follow the catalogue:

| | `0480c76` (320 rows) | `b2c0082` (310 rows) |
| --- | --- | --- |
| pinned (hand-computed vectors) | 6 | **6** |
| constrained (asserted bounds) | 111 | **108** |
| structural (draws, deterministic, pure, aligned, on its declared scale) | 203 | **196** |

`seal.the-manifest-transcribes-it-rather-than-computing-it` re-derives all three every proof run and
compares them against the committed totals; `oracle.counter-implementation` still measures the vendor
against this repo's own implementations at maxAbs ≤ 2.84e-13 on six series.

---

## Summary

**Overall**: ❌ **Not ready to be marked done.** Ready to open **with a written caveat**, if the owner
prefers that to three more iterations — the shipped behaviour is right; the evidence for two of its
criteria is not.

**Spec-anchored check**: 20/23 ACs match the spec-defined outcome · 2 gaps · 1 PARTIAL (declared) ·
1 spec-precision gap
**Sensor**: 25 injected, 21 killed, **4 survived**
**Gate**: `npm test` 1449/1449 · `npm run e2e` 96/96 · `npm run proof` 33/33 ·
`size-gate` 104853/104853 · `verify-package-paths` OK — every one exit 0, all re-run clean after the
sensor, real tree porcelain identical to the pre-sensor baseline.

**Next steps**: Fixes 1 and 3 are small and mechanical and would flip this to PASS. Fix 2 is one new
suite. Fix 4 is one assertion. Fix 5 is a paragraph in the PR body and is required either way.
