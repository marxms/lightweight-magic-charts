/**
 * A NUMBER THAT MOVED IS DECLARED, NEVER REGENERATED INTO THE TREE.
 *
 * `fingerprints.json` digests the computed VALUES so that a vendor release which changes what a
 * number IS cannot pass unseen. That defence has one hole, and it is the ordinary workflow: the
 * regeneration is part of taking the release. Install the new version, run the generator, commit
 * what it wrote, and `--check` is green again over a value nobody read. One digest line moved and
 * nothing asked why. Measured, not argued: an inverted-weight `wma` — 2.1% wrong against its own
 * fixture — was planted, the artefacts were regenerated the way a release arrives, and the proof
 * reported every case passing.
 *
 * So the digest gets the rule an id already has. `renames.json` exists because the generator can
 * see that an id disappeared and CANNOT see whether the vendor renamed it or removed it; it refuses
 * to write until a human writes which. This is the same shape one level down: the generator can see
 * that a number moved and cannot see whether the vendor fixed a defect or introduced one. So it
 * refuses to write until `value-changes.json` says, with the id, the digest it moved from, the
 * digest it moved to, and the reason.
 *
 * ── WHAT THIS CLOSES, AND WHAT IT DOES NOT ────────────────────────────────────────────────────
 *
 * It closes the regeneration path: no run of the generator can overwrite a digest that nobody
 * declared, and no `--check` reports a moved digest as merely stale.
 *
 * AND IT CLOSES THE CHEAPER PATH, which is not forging a digest but DELETING one. An absent entry
 * read as "a new indicator has nothing to declare" hands the sanctioned command back the hole this
 * file was written to close: measured, the same inverted-weight `wma` with `entries.wma` removed
 * from `fingerprints.json` regenerated in silence, `--check` exited 0 and the proof reported every
 * case passing, with the wrong number inside. So an id the COMMITTED MANIFEST still offers and the
 * fingerprint file no longer covers is a proof that vanished, not an indicator that appeared, and it
 * is refused on the same terms — while an id the committed manifest does not offer is genuinely new
 * and needs no declaration.
 *
 * It does NOT make a hand-forged `fingerprints.json` impossible — a digest typed in by hand to match
 * a hand-patched vendor agrees with itself — and it does not stop an editor who deletes the
 * indicator from the manifest AND the fingerprints in the same edit, which offers it back as new at
 * the cost of moving a whole catalogue entry in the diff. Both are hand-edited artefacts against the
 * doctrine written at the top of the file being edited, visible as such in a diff, and they are the
 * same trust boundary `renames.json` and `size-budget.json` already sit on. Overclaiming here would
 * be the defect this file exists to catch.
 */

/** A digest is a sha256 in lower-case hex, and anything else is a typo before it is a declaration. */
const HEX64 = /^[0-9a-f]{64}$/;
/**
 * The floor a reason has to clear. Short enough that a real sentence passes, long enough that
 * "vendor update" — which says only what the git log already says — does not.
 */
const REASON_FLOOR = 40;

const short = (digest) => `${String(digest).slice(0, 12)}…`;

/**
 * Every fault the ledger and the digests carry between them, each named with its measurement.
 *
 * `committed` and `derived` are both `{ [id]: { values, confirmsWithinBars } }` — the first read out
 * of `fingerprints.json`, the second computed by this run. `offered` is the ids the COMMITTED
 * manifest offers, and it is what tells an absent digest apart from a new indicator: without it the
 * two are the same shape, and the cheapest way past this rule is to make a proof look like a debut.
 */
export function valueLedgerFaults({ committed, derived, ledger, offered }) {
  const changes = Array.isArray(ledger?.changes) ? ledger.changes : null;
  if (changes === null) {
    return [{ id: '—', fault: 'unreadable', detail: 'the ledger carries no `changes` array' }];
  }
  if (!Array.isArray(offered) && !(offered instanceof Set)) {
    return [{ id: '—', fault: 'unreadable', detail: 'the caller did not say which ids the committed manifest offers, and an absent digest cannot be told from a new indicator without that' }];
  }
  const offers = new Set(offered);

  const faults = [];
  const say = (id, fault, detail) => faults.push({ id, fault, detail });

  /* ---- the ledger answers for itself before it is allowed to answer for a digest ---- */
  const head = new Map();
  for (const [at, row] of changes.entries()) {
    const where = `entry ${at}`;
    if (typeof row?.id !== 'string' || !HEX64.test(row?.from ?? '') || !HEX64.test(row?.to ?? '')) {
      say(row?.id ?? '—', 'malformed', `${where}: an id and two 64-character hex digests are the whole of the form`);
      continue;
    }
    const settles = row.settles;
    const settleMoved = Number.isInteger(settles?.from) && Number.isInteger(settles?.to) && settles.from !== settles.to;
    if (row.from === row.to && !settleMoved) {
      say(row.id, 'malformed', `${where}: declares a move from ${short(row.from)} to itself, and no settle window moved either`);
    }
    if (typeof row.reason !== 'string' || row.reason.trim().length < REASON_FLOOR) {
      say(row.id, 'no-reason', `${where}: the reason is the one thing a generator cannot write; ${REASON_FLOOR} characters is the floor`);
    }
    const previous = head.get(row.id);
    if (previous !== undefined && previous.to !== row.from) {
      say(row.id, 'broken-chain', `${where}: starts at ${short(row.from)} where the entry before it ended at ${short(previous.to)} — this file is append-only, so the chain has to link`);
    }
    head.set(row.id, row);
  }

  /* ---- and the newest declaration has to describe the value this run derives ---- */
  for (const [id, newest] of head) {
    const now = derived[id]?.values;
    if (now === undefined) { say(id, 'unoffered', 'declares a value for an id this run does not offer'); continue; }
    if (newest.to !== now) {
      say(id, 'stale-head', `the newest declaration ends at ${short(newest.to)} and this run derives ${short(now)} — a ledger that stops describing the value it governs governs nothing`);
    }
  }

  /* ---- then every digest that moved, against what was declared for it ---- */
  for (const [id, row] of Object.entries(derived)) {
    const was = committed[id];
    if (was === undefined) {
      // A NEW indicator has no old value, so there is nothing to declare and nothing to launder —
      // but "new" is a claim the committed manifest can check. An id it still OFFERS had a digest
      // and no longer has one, which is a proof that was deleted, and deleting it is exactly what
      // gets a moved number through the sanctioned regeneration command.
      if (!offers.has(id)) continue;
      const restated = changes.some((entry) => entry?.id === id && entry.to === row.values);
      if (!restated) {
        say(id, 'vanished-fingerprint', `the committed manifest offers it and no digest is on file for it — an entry that was there and is gone is not a new indicator; restore it, or declare the move to ${short(row.values)} like any other`);
      }
      continue;
    }
    const movedValue = was.values !== row.values;
    const movedSettle = was.confirmsWithinBars !== row.confirmsWithinBars;
    if (!movedValue && !movedSettle) continue;

    const chain = changes.filter((entry) => entry?.id === id);
    const declared = chain.find((entry) => entry.from === was.values && entry.to === row.values);
    if (declared === undefined) {
      const claimsTo = chain.find((entry) => entry.to === row.values);
      const claimsFrom = chain.find((entry) => entry.from === was.values);
      if (claimsTo !== undefined) {
        say(id, 'wrong-from', `declared as moving from ${short(claimsTo.from)}, and the digest on file is ${short(was.values)} — a declaration that starts somewhere else describes a different change`);
      } else if (claimsFrom !== undefined) {
        say(id, 'wrong-to', `declared as moving to ${short(claimsFrom.to)}, and this run derives ${short(row.values)}`);
      } else {
        say(id, 'undeclared', `${short(was.values)} → ${short(row.values)}, and nothing says why`);
      }
      continue;
    }
    if (movedSettle && !(declared.settles?.from === was.confirmsWithinBars && declared.settles?.to === row.confirmsWithinBars)) {
      say(id, 'undeclared-settle', `settles within ${row.confirmsWithinBars} bars where the file says ${was.confirmsWithinBars}, and the declaration does not carry the move`);
    }
  }

  return faults;
}

/** What the generator prints instead of writing, and what `--check` prints instead of "stale". */
export function valueLedgerRefusal(faults, ledgerPath) {
  return [
    `build-indicator-manifest: REFUSING. ${faults.length} indicator value change(s) are not declared:`,
    ...faults.map((fault) => `  ${fault.id} — ${fault.fault}: ${fault.detail}`),
    '',
    'A digest in example/indicators/fingerprints.json IS an indicator\'s arithmetic. Regenerating it as',
    'part of taking a vendor release is the check checking itself: the number moves, the file moves with',
    'it, and the gate is green over a value nobody read. This generator can see that a number moved. It',
    'CANNOT see whether the vendor fixed a defect or shipped one, and those two have opposite',
    'consequences for every chart drawn from it. Write which — the id, the digest it moved from, the',
    `digest it moved to and the reason — in ${ledgerPath},`,
    'which is append-only. A digest that is ABSENT is not a new indicator either: while the committed',
    'manifest still offers the id, the entry was deleted rather than born, and deleting it is the',
    'cheapest way past this rule. A wrong number only gets through a red build.',
  ].join('\n');
}
