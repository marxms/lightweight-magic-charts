/**
 * Every path the manifest promises must resolve to something that exists.
 *
 * `files` and `exports` are promises made to a consumer who is not in the room. A `files` entry that
 * matches nothing ships a tarball without it; an `exports` target that points at a missing file is
 * an install that resolves and then throws on the first import. Both are silent here and loud there.
 *
 * WHY THIS IS A SCRIPT AND NOT A WORKFLOW STEP: it used to be a heredoc inside `ci.yml`, which meant
 * the release path could not run it without copying it, and a contributor could not run it at all.
 * The rule this package holds itself to is that nothing in CI is stronger than what you can run
 * locally — a check that exists only inside a workflow breaks that rule by construction.
 *
 * DECLARED BLIND SPOT: it asserts that the paths resolve, not that their CONTENTS are right. A
 * `dist/` built from stale source passes here; the size budget and the derived reference are what
 * refuse an artefact older than its source. Run it after a build, never instead of one.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const failures = [];

for (const promised of manifest.files ?? []) {
  if (!existsSync(join(ROOT, promised))) {
    failures.push(`files[] promises a path that does not exist: ${promised}`);
  }
}

/** `exports` is either a string or a condition map, and a map may nest. Walk both. */
function targetsOf(node) {
  if (typeof node === 'string') return [node];
  if (node && typeof node === 'object') return Object.values(node).flatMap(targetsOf);
  return [];
}

for (const [subpath, node] of Object.entries(manifest.exports ?? {})) {
  for (const target of targetsOf(node)) {
    if (!existsSync(join(ROOT, target))) {
      failures.push(`exports ${subpath} points at a missing file: ${target}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`verify-package-paths: FAIL — ${failures.length} broken promise(s)`);
  process.exit(1);
}

const counted = (manifest.files ?? []).length + Object.keys(manifest.exports ?? {}).length;
if (counted === 0) {
  console.error('verify-package-paths: FAIL — the manifest promises nothing, so this proved nothing');
  process.exit(1);
}

console.log(`verify-package-paths: OK — files[] and exports both resolve (${counted} entries)`);
