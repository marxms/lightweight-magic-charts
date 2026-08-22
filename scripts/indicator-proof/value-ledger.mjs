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
 * AND IT FOLLOWS AN ID THROUGH ITS RENAMES, because a rename is a claim about the NAME and says
 * nothing about the arithmetic. `renames.json` resolved the vanished id for the generator and the
 * old digest simply left the file: the new id had never been seen, so it was read as a debut, and a
 * debut has no old value to answer to. MEASURED: `wma` renamed to `wma-weighted` in the registry
 * with its arithmetic multiplied by 1.0001 and only the rename declared wrote, passed `--check` and
 * passed the proof, with the new id on file at the digest an undeclared move is refused for. Vendors
 * rename and rewrite an indicator in the same release routinely. So the committed digest is carried
 * forward under the new id BEFORE anything is judged, and the OFFER is carried with it — otherwise
 * deleting the old entry buys back through the rename exactly what deleting it buys anywhere else.
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
 * reason written by hand. An identity that changed with NO entry in the chain is refused like
 * anything else.
 *
 * SEPARATING THEM IS NOT EXCUSING ONE WITH THE OTHER, and for one release it was. Comparing two
 * digests taken over different spellings measures nothing — true, and it was implemented as a
 * `continue` that skipped the per-id comparison for EVERY id the moment one line in the `encodings`
 * chain declared a re-spelling. MEASURED: the vendor bumped to 0.5.1 everywhere, `wma`'s arithmetic
 * multiplied by 1.0001 and the quantum re-spelled from 2^-36 to 2^-34 in one run — 310 of 310
 * digests rewritten, ZERO value declarations, the proof 34/34 and `--check` exit 0, with `wma` on
 * file at the byte-for-byte digest this rule refuses when it arrives alone. Every one of the 304
 * rows whose only oracle is its digest was covered by that one line.
 *
 * The comparison never needed THIS run's spelling. It needed the spelling the committed file was
 * written in, and `value-encoding.mjs` keeps every one this catalogue has committed under
 * addressable by its identity. So when the identity moves, each id is re-derived under the
 * COMMITTED identity as well and the per-id comparison is made on that pair: identical means no
 * value moved and the re-spelling is what it claims to be, different means a value moved and is
 * declared like any other — in the spelling the digests on file are written in, because that is the
 * only spelling the two ends of the move share. A committed identity nothing can re-derive is
 * REFUSED rather than waved through: an unaddressable spelling is the amnesty by another name.
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
 * WHERE AN ID ENDS UP, following every rename recorded for it.
 *
 * The chain is walked rather than the single step taken, because `renames.json` is append-only and
 * a vendor that renames the same study twice leaves `a -> b` and `b -> c` side by side in it — an
 * `a` that stopped at `b` would then hand the digest to an id nothing offers, which is the debut
 * this closes, one link along. A cycle stops where it started rather than looping: a malformed
 * table is `catalogue.every-recorded-rename-lands-somewhere-offered`'s business, not a hang here.
 */
function landingOf(renames) {
  const next = new Map();
  for (const row of renames) {
    if (typeof row?.from !== 'string' || typeof row?.to !== 'string' || row.from === '' || row.to === '') continue;
    next.set(row.from, row.to);
  }
  return (id) => {
    let at = id;
    const seen = new Set([id]);
    while (next.has(at)) {
      const to = next.get(at);
      if (seen.has(to)) break;
      seen.add(to);
      at = to;
    }
    return at;
  };
}

/**
 * Every fault the ledger and the digests carry between them, each named with its measurement.
 *
 * `committed` and `derived` are both `{ [id]: { values, confirmsWithinBars } }` — the first read out
 * of `fingerprints.json`, the second computed by this run. `offered` is the ids the COMMITTED
 * manifest offers, and it is what tells an absent digest apart from a new indicator: without it the
 * two are the same shape, and the cheapest way past this rule is to make a proof look like a debut.
 * `encoding` is `{ committed, derived }` — the identity the committed file was written under and
 * the one this run encodes with. They agree on every ordinary run; when they do not, the digests on
 * file are written in a different spelling and comparing them to this run's says nothing at all —
 * so `underCommitted` carries the way out: `{ [id]: digest }`, this run's own computations spelled
 * under the COMMITTED identity, which is the only spelling the file's digests can be read against.
 * It is required exactly when the two identities differ, and a caller that cannot produce it (no
 * encoder is registered for the committed identity) says so with `null` and is refused — never
 * silently compared under the current spelling, which is how a re-spelling became an amnesty.
 *
 * `vendor` is `{ committed, derived }` — the pin the committed digests were taken under and the one
 * this run computes against, `version/peerVersion` each. It is what says whether a re-spelling
 * arrived alone or with a release, and the two may not arrive together.
 *
 * `renames` is `renames.json`'s own list, and the file is read THROUGH it: a digest and an offer
 * both follow their id to wherever the recorded renames land it, so an indicator that was renamed
 * and rewritten in one release answers for the value under its new name instead of arriving as a
 * debut with nothing to answer to.
 */
export function valueLedgerFaults({ committed, derived, ledger, offered, encoding, underCommitted, vendor, renames }) {
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
  if (typeof vendor?.committed !== 'string' || typeof vendor?.derived !== 'string') {
    return [{ id: '—', fault: 'unreadable', detail: 'the caller did not name the vendor pin the committed digests were taken under and the one this run computes against, and a re-spelling that arrives with a release is the one shape in which every digest in the file moves for two reasons at once' }];
  }
  if (!Array.isArray(renames)) {
    return [{ id: '—', fault: 'unreadable', detail: 'the caller did not hand over the recorded renames, and an id that was renamed arrives looking exactly like a debut — which is a value with no old digest to answer to' }];
  }
  /* ---- THE FILE IS READ THROUGH THE RENAME TABLE, BEFORE ANY OF IT IS JUDGED ------------------- *
   * A rename is a claim about the NAME. It resolves the vanished id one block up in the generator
   * and it says nothing whatever about the arithmetic — so the digest travels with the id, and so
   * does the OFFER that tells a deleted proof apart from a debut. Without the second half, deleting
   * `entries.wma` while renaming `wma` reaches the same place: the new id is offered by nothing the
   * committed manifest names, and an absent digest for an unoffered id is a genuine debut.        */
  const lands = landingOf(renames);
  const inherited = { ...committed };
  for (const [id, entry] of Object.entries(committed)) {
    const to = lands(id);
    if (to !== id && inherited[to] === undefined) inherited[to] = entry;
  }
  committed = inherited;
  const offers = new Set();
  for (const id of offered) { offers.add(id); offers.add(lands(id)); }
  const sameEncoding = encoding.committed === encoding.derived;

  const faults = [];
  const say = (id, fault, detail) => faults.push({ id, fault, detail });
  /**
   * WHICH SPELLING THE PER-ID COMPARISON IS MADE IN: the COMMITTED one, always. On an ordinary run
   * the two identities are one string and this changes nothing. When the identity moved, the
   * digests on file are written in the old spelling and the only digests comparable to them are
   * this run's, re-derived under that same old spelling — which is `underCommitted`.
   */
  const comparison = encoding.committed;
  /** Said out loud only when it is not the spelling this run writes, because then it is the point. */
  const under = sameEncoding ? '' : ` under \`${comparison}\`, the spelling the digests on file are written in`;

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

  /* ---- AND A RELEASE DOES NOT ARRIVE WEARING A RE-SPELLING ------------------------------------- *
   * The block below re-derives every id under the committed spelling and compares it, so a value
   * that moved is named whether or not the identity moved with it. That defence rests on ONE thing
   * the file cannot check: that the encoder registered under the old identity still spells the way
   * that identity spelled. Nothing else in the tree can confirm it, and a release is exactly the
   * moment somebody is editing both.
   *
   * So the two are kept apart, and the cost is one extra commit in the life of the catalogue. It is
   * also what a reviewer needs: in a run that does both, EVERY digest in the file moves anyway, and
   * a tampered one is invisible in the diff — which is how the measured laundering passed review in
   * the first place. `fingerprints.json` has always carried the pin it was written under and nothing
   * ever read it; this reads it.                                                                  */
  if (!sameEncoding && vendor.committed !== vendor.derived) {
    say('—', 'release-with-respelling', `the committed digests were taken under vendor ${vendor.committed} and this run computes against ${vendor.derived}, and the same run re-spells them from \`${encoding.committed}\` to \`${encoding.derived}\` — a release and a re-spelling may not arrive together, because the re-spelling moves every digest in the file at once and a value the release moved is then invisible in the diff. Take the release first and declare what its values did; re-spell in the commit after it, where every digest moves for exactly one reason`);
  }

  /* ---- AND A DECLARED RE-SPELLING STILL ANSWERS FOR EVERY VALUE UNDERNEATH IT ------------------ *
   * The declaration above buys the RIGHT TO REWRITE THE SPELLING and nothing else. What it used to
   * buy was silence: the per-id comparison below was skipped for every id, so one line in the chain
   * covered 310 digests and the tampered one among them. The comparison is made instead in the
   * spelling the file is written in — this run's own computations, re-derived under the COMMITTED
   * identity. A caller that cannot produce them is refused here rather than compared under the
   * current spelling, because an identity nothing can re-derive removes the comparison entirely,
   * which is exactly the amnesty this block exists to close.                                     */
  let comparable = derived;
  if (!sameEncoding) {
    if (underCommitted === null || underCommitted === undefined) {
      say('—', 'unaddressable-encoding', `the committed digests are written under \`${encoding.committed}\` and nothing this run derives is spelled that way, so not one of them can be read — keep every identity this catalogue has committed under addressable in value-encoding.mjs's ENCODERS, which is append-only for this reason: without the old spelling a declared re-grafting amnesties every value that moved with it`);
      return faults;
    }
    const missing = Object.keys(derived).filter((id) => !HEX64.test(underCommitted[id] ?? ''));
    if (missing.length > 0) {
      say('—', 'unaddressable-encoding', `${missing.length} id(s) were not re-derived under \`${encoding.committed}\`, so their committed digests cannot be read at all: ${missing.slice(0, 8).join(', ')}`);
      return faults;
    }
    comparable = Object.fromEntries(Object.entries(derived).map(([id, row]) => [id, { ...row, values: underCommitted[id] }]));
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
    // A declaration written under ANOTHER spelling is HISTORY: it says why the numbers became what
    // they are, and it answers for nothing being compared here, because its digests were taken over
    // a different encoding. Keeping it is the point of an append-only file; asking it to describe a
    // digest written in another spelling is not. It still answers for its own form above — an entry
    // does not stop being well-formed because the encoding moved on. The live spelling is the
    // COMMITTED one and not this run's: on an ordinary run they are the same string, and on a
    // re-spelling run the two ends of any value move are both on file in the old spelling, which is
    // the only one in which a `from` and a `to` can be compared at all.
    if (row.encoding !== comparison) { continue; }
    const previous = head.get(row.id);
    if (previous !== undefined && previous.to !== row.from) {
      say(row.id, 'broken-chain', `${where}: starts at ${short(row.from)} where the entry before it ended at ${short(previous.to)} — this file is append-only, so the chain has to link`);
    }
    head.set(row.id, row);
  }

  /* ---- and the newest declaration has to describe the value this run derives ---- */
  for (const [id, newest] of head) {
    const now = comparable[id]?.values;
    if (now === undefined) { say(id, 'unoffered', 'declares a value for an id this run does not offer'); continue; }
    if (newest.to !== now) {
      say(id, 'stale-head', `the newest declaration ends at ${short(newest.to)} and this run derives ${short(now)}${under} — a ledger that stops describing the value it governs governs nothing`);
    }
  }

  /* ---- then every digest that moved, against what was declared for it ------ *
   * READ IN THE SPELLING THE FILE IS WRITTEN IN. `comparable` is this run's own computations under
   * the COMMITTED identity, which on an ordinary run is `derived` itself and on a re-spelling run is
   * what makes the two ends of a move comparable at all. There is no branch here for the encoding
   * having moved, and that absence IS the fix: the branch there used to be skipped every id.     */
  for (const [id, row] of Object.entries(comparable)) {
    const was = committed[id];
    if (was === undefined) {
      // A NEW indicator has no old value, so there is nothing to declare and nothing to launder —
      // but "new" is a claim the committed manifest can check. An id it still OFFERS had a digest
      // and no longer has one, which is a proof that was deleted, and deleting it is exactly what
      // gets a moved number through the sanctioned regeneration command.
      if (!offers.has(id)) continue;
      const restated = changes.some((entry) => entry?.id === id && entry.encoding === comparison && entry.to === row.values);
      if (!restated) {
        say(id, 'vanished-fingerprint', `the committed manifest offers it and no digest is on file for it — an entry that was there and is gone is not a new indicator; restore it, or declare the move to ${short(row.values)}${under} like any other`);
      }
      continue;
    }
    const movedSettle = was.confirmsWithinBars !== row.confirmsWithinBars;
    const movedValue = was.values !== row.values;
    if (!movedValue && !movedSettle) continue;

    const chain = changes.filter((entry) => entry?.id === id && entry.encoding === comparison);
    const declared = chain.find((entry) => entry.from === was.values && entry.to === row.values);
    if (declared === undefined) {
      const claimsTo = chain.find((entry) => entry.to === row.values);
      const claimsFrom = chain.find((entry) => entry.from === was.values);
      if (claimsTo !== undefined) {
        say(id, 'wrong-from', `declared as moving from ${short(claimsTo.from)}, and the digest on file is ${short(was.values)}${under} — a declaration that starts somewhere else describes a different change`);
      } else if (claimsFrom !== undefined) {
        say(id, 'wrong-to', `declared as moving to ${short(claimsFrom.to)}, and this run derives ${short(row.values)}${under}`);
      } else if (sameEncoding) {
        say(id, 'undeclared', `${short(was.values)} → ${short(row.values)}, and nothing says why`);
      } else {
        // THE ONE THE RE-SPELLING USED TO COVER. Both digests are named in full because neither is
        // in any file a reader can open: the one on file is about to be overwritten in the new
        // spelling, and this one is derived only to make the comparison possible.
        say(id, 'undeclared', `${short(was.values)} → ${short(row.values)}${under}, and nothing says why — this run re-spells to \`${encoding.derived}\`, and a re-spelling moves no value, so this one moved on its own. Declare it in the spelling the two ends share: from ${was.values} to ${row.values} under \`${comparison}\``);
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
    `build-indicator-manifest: REFUSING. ${faults.length} change(s) to the committed digests are not declared:`,
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
    '',
    'THAT DECLARATION BUYS THE SPELLING AND NOTHING ELSE. Every id is re-derived under the identity',
    'the committed file carries and compared there, so a value that moved underneath a re-spelling is',
    'named here exactly as it would have been on its own — measured, because it once was not: a bump,',
    'a tampered indicator and a genuine re-spelling in one run rewrote 310 of 310 digests with no',
    'value declaration at all. The old spellings stay addressable in value-encoding.mjs for this',
    'reason, and an identity none of them answers to is refused rather than compared under this run\'s.',
  ].join('\n');
}
