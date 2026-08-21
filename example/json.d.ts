/**
 * A committed JSON artefact enters as `unknown`, and that is deliberate.
 *
 * `resolveJsonModule` would hand the compiler the literal type of a 287 KB generated file — 320
 * indicators, 1021 controls — and every editor and every `tsc -p tsconfig.example.json` would pay to
 * infer a type nobody wrote and nobody reads. Worse, it would make the shape of the manifest a
 * COMPILE-TIME fact derived from the file that happens to be committed today, so a generator change
 * would silently retype every reader instead of failing one of them.
 *
 * So the manifest arrives opaque and the adapter narrows it, the same way the adapter narrows
 * `StudySettings`: with a written interface and a runtime read that survives a shape it did not
 * expect. The narrowing is the host's obligation in both directions.
 */
declare module '*.json' {
  const value: unknown;
  export default value;
}
