/**
 * WHAT A STORED VALUE IS, AND WHO IS ALLOWED TO SAY SO — split out from the adapter on purpose.
 *
 * `example/indicators.ts` carries the committed catalogue, and the catalogue is 182 KB in the
 * bundle. It is therefore reached only through `import()`, on the visitor's first study. The FORM,
 * however, is a `WorkspaceSection.Body` that has to exist at module scope from the first render, or
 * the caret dies on every keystroke — so the form may not import the adapter for its code without
 * dragging the catalogue into the boot chunk with it.
 *
 * These are the lines both sides need and neither may duplicate: the types the manifest promises,
 * and the one function that decides whether a value the host is holding is a value at all. Measured
 * in the bundle, they cost about a kilobyte; the catalogue they describe costs a hundred and eighty.
 *
 * THE NARROWING IS THE HOST'S OBLIGATION. `StudySettings` is `unknown`, which is what refuses the
 * package a property read and keeps the vendor's vocabulary out of `src/`. Everything below is that
 * refusal being honoured.
 */

export type StudyValue = number | string | boolean;
export type StudyValues = Readonly<Record<string, StudyValue>>;

/** One control the form may offer. `enum` covers the vendor's `source` and `string` alike. */
export interface ManifestInput {
  readonly id: string;
  readonly type: 'int' | 'float' | 'bool' | 'enum';
  readonly defval: StudyValue;
  readonly fallbackTitle: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** The TOKENS, never a translated word. The vendor names its own sources. */
  readonly options?: readonly string[];
  /** This control does nothing until that one is switched on. */
  readonly gatedBy?: string;
}

export interface ManifestRow {
  readonly id: string;
  readonly fallbackLabel: string;
  readonly fallbackShortLabel: string;
  readonly category: string;
  readonly placement: 'over-price' | 'own-pane';
  /** The keys the vendor DECLARES and does not hide — never assumed, never `plot0` by default. */
  readonly plotIds: readonly string[];
  readonly plotTitles: readonly string[];
  readonly inputs: readonly ManifestInput[];
  readonly guide?: number;
}

export const EMPTY_VALUES: StudyValues = Object.freeze({});

/** A plain object and nothing else: an array, a `Date`, a `null`, a boxed primitive are not one. */
export function plainRecord(raw: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const proto: unknown = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) return null;
  return raw as Readonly<Record<string, unknown>>;
}

/** One control, one value. REFUSED, NEVER CLAMPED — a silently rewritten value was not chosen. */
export function acceptValue(control: ManifestInput, raw: unknown): StudyValue | undefined {
  if (control.type === 'bool') return typeof raw === 'boolean' ? raw : undefined;
  if (control.type === 'enum') {
    // The stored value is a TOKEN. A translated word is never a token, so it never round-trips in.
    return typeof raw === 'string' && (control.options ?? []).includes(raw) ? raw : undefined;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  if (control.type === 'int' && !Number.isInteger(raw)) return undefined;
  if (control.min !== undefined && raw < control.min) return undefined;
  if (control.max !== undefined && raw > control.max) return undefined;
  return raw;
}

/**
 * What one study holds, read against the manifest ROW — so a control this build stopped offering
 * cannot come back in through a stored payload, and one rubbish value costs itself and nothing else.
 */
export function readStudyValues(held: unknown, row: ManifestRow): StudyValues {
  const record = plainRecord(held);
  if (record === null) return EMPTY_VALUES;
  const out: Record<string, StudyValue> = {};
  for (const control of row.inputs) {
    if (!Object.prototype.hasOwnProperty.call(record, control.id)) continue;
    const value = acceptValue(control, record[control.id]);
    if (value !== undefined) out[control.id] = value;
  }
  return Object.freeze(out);
}
