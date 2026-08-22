/**
 * The tokens every component in this package paints with — plain values, no styling runtime.
 * See docs/explanation/react.md#why-a-token-object-and-not-a-styling-library
 */

export const CENTER_ROW = { display: 'flex', alignItems: 'center' } as const;

export const STACK = { display: 'flex', flexDirection: 'column' } as const;

export interface WorkspaceTheme {
  readonly background: string;
  readonly text: string;
  readonly gridLine: string;
  readonly referenceLine: string;
  readonly surface: string;
  readonly control: string;
  readonly border: string;
  readonly accent: string;
  /** The fill an active control carries. DECLARED, never derived. See docs/explanation/react.md#accentfill-is-declared-and-never-derived */
  readonly accentFill: string;
  readonly accentText: string;
  readonly legendShadow: string;
  readonly fontFamily: string;
}

export const DEFAULT_WORKSPACE_THEME: WorkspaceTheme = {
  background: 'transparent',
  text: '#B8BCC4',
  gridLine: 'rgba(255,255,255,0.05)',
  referenceLine: 'rgba(255,255,255,0.28)',
  surface: '#0b0e13',
  control: '#161b22',
  border: 'rgba(255,255,255,0.14)',
  accent: '#2962FF',
  accentFill: 'rgba(41,98,255,0.22)',
  accentText: '#ffffff',
  legendShadow: '0 1px 4px rgba(0,0,0,0.95)',
  fontFamily: 'Inter, system-ui, sans-serif',
};

export const accented = (theme: WorkspaceTheme, on: boolean) => ({
  background: on ? theme.accentFill : 'transparent',
  color: on ? theme.accentText : theme.text,
});
