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
 * AND IT SEPARATES A VALUE THAT MOVED FROM A SPELLING THAT CHANGED. The rule above is right for a
 * value and wrong for the ENCODING: changing how a reading is written down moves every digest in
 * the file at once, and declaring three hundred value changes for it would be three hundred false
 * statements — no value moved, the spelling did. So `fingerprints.json` carries the encoding's
 * IDENTITY, and a change of identity is declared once, in this file's `encodings` chain, with the
 * reason written by hand. While the identity holds, every digest answers for itself exactly as
 * before; when it changes and the chain says so, the whole file is re-derived and the per-id
 * comparison is not made, because comparing two digests taken over different spellings measures
 * nothing. An identity that changed with NO entry in the chain is refused like anything else.
 *
 * It does NOT make a hand-forged `fingerprints.json` impossible — a digest typed in by hand to match
 * a hand-patched vendor agrees with itself, and in a repository diff exactly ONE committed file
 * moves. What that costs is the doctrine at the top of the file being edited, which names this rule
 * and the declaration it wants, and a reviewer reading a digest change with nothing beside it. The
 * same holds for deleting the indicator from the manifest AND the fingerprints in one edit, which
 * offers it back as new at the price of moving a whole catalogue entry. Both are the trust boundary
 * `renames.json` and `size-budget.json` already sit on. Overclaiming here would be the defect this
 * file exists to catch.
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
 * `encoding` is `{ committed, derived }` — the identity the committed file was written under and
 * the one this run encodes with. They agree on every ordinary run; when they do not, the digests on
 * file are written in a different spelling and comparing them to this run's says nothing at all.
 */
export function valueLedgerFaults({ committed, derived, ledger, offered, encoding }) {
  const changes = Array.isArray(ledger?.changes) ? ledger.changes : null;
  if (changes === null) {
    return [{ id: '—', fault: 'unreadable', detail: 'the ledger carries no `changes` array' }];
  }
  const encodings = Array.isArray(ledger?.encodings) ? ledger.encodings : null;
  if (encodings === null) {
    return [{ id: '—', fault: 'unreadable', detail: 'the ledger carries no `encodings` array, and an encoding that cannot be declared is one that changes in silence' }];
  }
  if (!Array.isArray(offered) && !(offered instanceof Set)) {
    return [{ id: '—', fault: 'unreadable', detail: 'the caller did not say which ids the committed manifest offers, and an absent digest cannot be told from a new indicator without that' }];
  }
  if (typeof encoding?.committed !== 'string' || typeof encoding?.derived !== 'string') {
    return [{ id: '—', fault: 'unreadable', detail: 'the caller did not name the encoding the committed digests were written under and the one this run writes, and without both a re-spelling is indistinguishable from three hundred values moving' }];
  }
  const offers = new Set(offered);
  const sameEncoding = encoding.committed === encoding.derived;

  const faults = [];
  const say = (id, fault, detail) => faults.push({ id, fault, detail });

  /* ---- the encoding answers first, because what it says decides whether the digests can be read ---- */
  let encodingHead = null;
  for (const [at, row] of encodings.entries()) {
    const where = `encodings entry ${at}`;
    if (typeof row?.from !== 'string' || typeof row?.to !== 'string' || row.from === '' || row.to === '') {
      say('—', 'malformed-encoding', `${where}: two encoding names are the whole of the form`);
      continue;
    }
    if (row.from === row.to) {
      say('—', 'malformed-encoding', `${where}: declares a move from \`${row.from}\` to itself`);
    }
    if (typeof row.reason !== 'string' || row.reason.trim().length < REASON_FLOOR) {
      say('—', 'no-reason', `${where}: re-spelling every digest in the file is the one change a generator can make without a single value moving, so the reason is the whole of the evidence; ${REASON_FLOOR} characters is the floor`);
    }
    if (encodingHead !== null && encodingHead.to !== row.from) {
      say('—', 'broken-encoding-chain', `${where}: starts at \`${row.from}\` where the entry before it ended at \`${encodingHead.to}\` — this file is append-only, so the chain has to link`);
    }
    encodingHead = row;
  }
  if (encodingHead !== null && encodingHead.to !== encoding.derived) {
    say('—', 'stale-encoding-head', `the newest encoding declaration ends at \`${encodingHead.to}\` and this run encodes with \`${encoding.derived}\` — a chain that stops describing the spelling it governs governs nothing`);
  }
  if (!sameEncoding) {
    const declared = encodings.some((row) => row?.from === encoding.committed && row?.to === encoding.derived);
    if (!declared) {
      say('—', 'undeclared-encoding', `the committed digests were written under \`${encoding.committed}\` and this run writes \`${encoding.derived}\`, and nothing in the chain says why — a re-spelling moves every digest in the file at once, which is the cheapest way there is to make three hundred changed values look like one refactor`);
    }
  }

  /* ---- the ledger answers for itself before it is allowed to answer for a digest ---- */
  const head = new Map();
  for (const [at, row] of changes.entries()) {
    const where = `entry ${at}`;
    if (typeof row?.id !== 'string' || !HEX64.test(row?.from ?? '') || !HEX64.test(row?.to ?? '')) {
      say(row?.id ?? '—', 'malformed', `${where}: an id and two 64-character hex digests are the whole of the form`);
      continue;
    }
    if (typeof row.encoding !== 'string' || row.encoding === '') {
      say(row.id, 'malformed', `${where}: names no encoding, and a digest whose spelling is unknown cannot be compared with anything`);
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
    // A declaration written under an earlier spelling is HISTORY: it says why the numbers became
    // what they are, and it answers for nothing this run derives, because its digests were taken
    // over a different encoding. Keeping it is the point of an append-only file; asking it to
    // describe a digest written in another spelling is not. It still answers for its own form
    // above — an entry does not stop being well-formed because the encoding moved on.
    if (row.encoding !== encoding.derived) { continue; }
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
      const restated = changes.some((entry) => entry?.id === id && entry.encoding === encoding.derived && entry.to === row.values);
      if (!restated) {
        say(id, 'vanished-fingerprint', `the committed manifest offers it and no digest is on file for it — an entry that was there and is gone is not a new indicator; restore it, or declare the move to ${short(row.values)} like any other`);
      }
      continue;
    }
    const movedSettle = was.confirmsWithinBars !== row.confirmsWithinBars;
    // THE ENCODING MOVED, SO THE DIGESTS ARE NOT COMPARABLE — and pretending otherwise would print
    // 310 undeclared moves for a change in which no value moved at all. The chain above has already
    // refused unless a human declared the re-spelling, so this is the sanctioned branch, not a hole:
    // one declaration bought it, and every digest below is re-derived rather than compared. The
    // SETTLE WINDOW is not part of the spelling — it is a bar count measured against a tolerance —
    // so it still answers for itself here.
    if (!sameEncoding) {
      if (movedSettle) {
        const carried = changes.some((entry) => entry?.id === id && entry.encoding === encoding.derived
          && entry.to === row.values && entry.settles?.from === was.confirmsWithinBars && entry.settles?.to === row.confirmsWithinBars);
        if (!carried) {
          say(id, 'undeclared-settle', `settles within ${row.confirmsWithinBars} bars where the file says ${was.confirmsWithinBars}; re-spelling a digest does not move a bar count, so this one moved on its own and nothing says why`);
        }
      }
      continue;
    }
    const movedValue = was.values !== row.values;
    if (!movedValue && !movedSettle) continue;

    const chain = changes.filter((entry) => entry?.id === id && entry.encoding === encoding.derived);
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
    '',
    'If what changed is the ENCODING rather than any value — every digest in the file moving at once,',
    'with no indicator computing anything different — that is declared ONCE, in the same file\'s',
    '`encodings` chain, naming the spelling it moved from, the spelling it moved to and why. Declaring',
    'it as three hundred value changes would be three hundred false statements.',
  ].join('\n');
}
