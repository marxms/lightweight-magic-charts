/**
 * THE FORM THE LIBRARY REFUSES TO DRAW, drawn by the host — which is the whole of the seam in one
 * file.
 *
 * 320 studies carrying up to sixteen controls each is 1021 declared strings, none of which the
 * library ever renders: it renders `<Body />` and sees nothing inside. `chrome.labels` is a CLOSED
 * record of groups and could not hold them if it wanted to. So the naming lives here, in the host's
 * own dictionary, keyed by the vendor's own ids — and the package stores what comes back without
 * ever reading a member of it.
 *
 * ── `Body` IS AT MODULE SCOPE, AND THAT IS THE WHOLE OF THE CARET RISK ─────────────────────────
 *
 * React reconciles by `element.type`, and `<activeSection.Body />`'s type is the FUNCTION
 * REFERENCE. A new `sections` array carrying a new section object with the SAME `Body` is a
 * re-render, not a remount — measured, with the section's `count` moving on every keystroke and the
 * caret staying put. What loses the caret is a `Body` built inline in the host's render: measured
 * too, and it goes on the FIRST character, because a fresh function per render is a fresh element
 * type. `ChromeContext`'s churn sensor keys each `Body` through a `WeakMap` and warns when the
 * shape moves, which is what makes rule 1 gate-able from outside — see the e2e's
 * `params.no-section-churn`.
 *
 * The other two rules are here as well: exactly ONE host section, declared once at module scope and
 * never reordered (the library prepends its own three, so the host's is always last and never at
 * index 0), and state that lives OUTSIDE the React tree — the committed values are the tab's, so a
 * remount from a hover or a search costs the caret and nothing else.
 *
 * ── OUT OF RANGE IS REFUSED, NEVER CLAMPED ────────────────────────────────────────────────────
 *
 * A value silently rewritten to a bound is a value the user did not choose, arriving back on every
 * load. So the field says so — `aria-invalid`, and a describing node that switches to the sentence
 * naming the range — and NOTHING is written. The field also holds a local draft, so a user can type
 * through an invalid prefix; the draft surrenders the moment the committed value moves under it,
 * which is what a reset, a tab switch and a re-import all do.
 */
import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';

import type { WorkspaceSection } from 'lightweight-magic-charts';
import { useWorkspaceSetup, useWorkspaceSetupWriter } from 'lightweight-magic-charts';

import { acceptValue, readStudyValues } from './studyValues';
import type { ManifestInput, ManifestRow, StudyValue, StudyValues } from './studyValues';

/* ---- the rows the form draws, published from outside the React tree ------------------------- */

let published: readonly ManifestRow[] = [];
const listeners = new Set<() => void>();
const readRows = (): readonly ManifestRow[] => published;
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The catalogue arrives asynchronously and the form is already mounted, so it is handed over rather
 * than imported: importing it would put 182 KB of committed manifest in the boot chunk behind a
 * component that renders three fields.
 */
export function publishStudyRows(rows: readonly ManifestRow[]): void {
  published = rows;
  for (const listener of Array.from(listeners)) listener();
}

/* ---- the controls, one element per declared type -------------------------------------------- */

const FIELD_ROW = { display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' } as const;
const LABEL = { fontSize: 11.5, minWidth: 130 } as const;
const BOUNDS = { fontSize: 10, opacity: 0.7 } as const;

const fieldId = (row: ManifestRow, control: ManifestInput): string => `param-${row.id}-${control.id}`;

/** The range in words, because a spinner does not announce its limits to a screen reader. */
function boundsSentence(control: ManifestInput): string {
  const kind = control.type === 'int' ? 'A whole number' : 'A number';
  const range =
    control.min !== undefined && control.max !== undefined
      ? ` from ${control.min} to ${control.max}`
      : control.min !== undefined
        ? ` of at least ${control.min}`
        : control.max !== undefined
          ? ` of at most ${control.max}`
          : '';
  const gate = control.gatedBy === undefined ? '' : ` Takes effect once ${control.gatedBy} allows it.`;
  return `${kind}${range}.${gate}`;
}

const refusalSentence = (control: ManifestInput, typed: string): string =>
  `${typed || 'Nothing'} is outside what this control accepts, so nothing was saved. ${boundsSentence(control)}`;

interface FieldProps {
  readonly row: ManifestRow;
  readonly control: ManifestInput;
  readonly value: StudyValue;
  readonly onWrite: (value: StudyValue) => void;
}

function NumberField({ row, control, value, onWrite }: FieldProps): ReactElement {
  const id = fieldId(row, control);
  const [draft, setDraft] = useState<string | null>(null);
  const [seen, setSeen] = useState<StudyValue>(value);
  // DERIVED DURING RENDER, which is what makes the draft surrender to an outside write: a reset, a
  // tab switch and a re-import all move the committed value under a half-typed field.
  if (seen !== value) {
    setSeen(value);
    setDraft(null);
  }
  const text = draft ?? String(value);
  const accepted = acceptValue(control, text.trim() === '' ? Number.NaN : Number(text));
  const refused = draft !== null && accepted === undefined;
  return (
    <div style={FIELD_ROW}>
      <label htmlFor={id} style={LABEL}>
        {control.fallbackTitle}
      </label>
      <input
        id={id}
        data-testid={id}
        type="number"
        inputMode={control.type === 'int' ? 'numeric' : 'decimal'}
        value={text}
        min={control.min}
        max={control.max}
        step={control.step ?? (control.type === 'int' ? 1 : 'any')}
        aria-describedby={`${id}-bounds`}
        aria-invalid={refused}
        style={{ width: 90, fontSize: 11.5 }}
        onChange={(event) => {
          const typed = event.target.value;
          setDraft(typed);
          const next = acceptValue(control, typed.trim() === '' ? Number.NaN : Number(typed));
          if (next !== undefined) onWrite(next);
        }}
      />
      <span id={`${id}-bounds`} data-testid={`${id}-bounds`} style={BOUNDS}>
        {refused ? refusalSentence(control, text) : boundsSentence(control)}
      </span>
    </div>
  );
}

function SwitchField({ row, control, value, onWrite }: FieldProps): ReactElement {
  const id = fieldId(row, control);
  const on = value === true;
  return (
    <div style={FIELD_ROW}>
      {/* `aria-checked`, never `aria-pressed`: this is a switch, which is what `chrome/Toggle` uses. */}
      <span id={`${id}-label`} style={LABEL}>
        {control.fallbackTitle}
      </span>
      <button
        type="button"
        role="switch"
        id={id}
        data-testid={id}
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-bounds`}
        style={{ fontSize: 11.5, cursor: 'pointer' }}
        onClick={() => onWrite(!on)}
      >
        {on ? 'On' : 'Off'}
      </button>
      <span id={`${id}-bounds`} data-testid={`${id}-bounds`} style={BOUNDS}>
        On or off.
      </span>
    </div>
  );
}

function ChoiceField({ row, control, value, onWrite }: FieldProps): ReactElement {
  const id = fieldId(row, control);
  const options = control.options ?? [];
  return (
    <div style={FIELD_ROW}>
      <label htmlFor={id} style={LABEL}>
        {control.fallbackTitle}
      </label>
      {/* A native `select`: arrows, type-ahead, Home/End and the mobile picker all come free. */}
      <select
        id={id}
        data-testid={id}
        value={String(value)}
        aria-describedby={`${id}-bounds`}
        style={{ fontSize: 11.5 }}
        onChange={(event) => {
          // THE TOKEN IS WHAT IS STORED. The option's value is the vendor's own string, so a
          // translated caption could never round-trip into the payload even if one were shown.
          const next = acceptValue(control, event.target.value);
          if (next !== undefined) onWrite(next);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span id={`${id}-bounds`} data-testid={`${id}-bounds`} style={BOUNDS}>
        {`One of ${options.length}: ${options.join(', ')}.`}
      </span>
    </div>
  );
}

/* ---- one study ------------------------------------------------------------------------------ */

function StudyFieldset({ row }: { readonly row: ManifestRow }): ReactElement {
  const write = useWorkspaceSetupWriter();
  const held = useWorkspaceSetup((setup) => setup.studySettings);
  const values: StudyValues = readStudyValues(held?.[row.id], row);
  const commit = (next: StudyValues): void => {
    write({ studySettings: { ...held, [row.id]: next } });
  };
  return (
    <fieldset
      data-testid={`param-${row.id}`}
      style={{ border: 'none', padding: 0, margin: '0 0 10px' }}
    >
      <legend style={{ fontSize: 11.5, fontWeight: 600, padding: 0 }}>{row.fallbackLabel}</legend>
      {row.inputs.length === 0 ? (
        <span style={BOUNDS}>This study takes no inputs.</span>
      ) : (
        <>
          {row.inputs.map((control) => {
            const value = values[control.id] ?? control.defval;
            const onWrite = (next: StudyValue): void => commit({ ...values, [control.id]: next });
            if (control.type === 'bool') {
              return <SwitchField key={control.id} row={row} control={control} value={value} onWrite={onWrite} />;
            }
            if (control.type === 'enum') {
              return <ChoiceField key={control.id} row={row} control={control} value={value} onWrite={onWrite} />;
            }
            return <NumberField key={control.id} row={row} control={control} value={value} onWrite={onWrite} />;
          })}
          {/*
            RESET WRITES NOTHING, not the defaults. Storing today's `defaultInputs` would freeze
            them into a payload that the next vendor release contradicts.
          */}
          <button
            type="button"
            data-testid={`param-${row.id}-reset`}
            style={{ fontSize: 11, cursor: 'pointer' }}
            onClick={() => commit({})}
          >
            Reset {row.fallbackLabel}
          </button>
        </>
      )}
    </fieldset>
  );
}

/* ---- the section --------------------------------------------------------------------------- */

/** MODULE SCOPE. Not inline, not `useMemo`d per render, not wrapped in a fresh `memo()`. */
function StudyParamsBody(): ReactElement {
  const rows = useSyncExternalStore(subscribe, readRows, readRows);
  const chosen = useWorkspaceSetup((setup) => setup.indicators);
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row] as const)), [rows]);
  const active = chosen.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
  return (
    <div data-testid="param-form">
      {active.length === 0 ? (
        <span style={BOUNDS} data-testid="param-form-empty">
          Choose a study from the catalogue to edit what it computes.
        </span>
      ) : (
        active.map((row) => <StudyFieldset key={row.id} row={row} />)
      )}
    </div>
  );
}

/**
 * ONE SECTION, DECLARED ONCE. The array is a module-scope constant so its identity cannot churn,
 * and the library prepends its own three sections, so this one is always last and never index 0 —
 * which is what stops it being unmounted by the rail's fallback selection.
 */
export const STUDY_PARAM_SECTIONS: readonly WorkspaceSection[] = [
  { id: 'params', label: 'Inputs', count: 0, Body: StudyParamsBody },
];
