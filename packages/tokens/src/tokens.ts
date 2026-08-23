/**
 * Design tokens — the shared visual vocabulary of Heaven Hospitality.
 *
 * These are *values*, not components. Admin (web) and mobile (React Native) build
 * their own UI primitives from the same numbers so the two products feel like one
 * without pretending a `<View>` and a `<div>` are the same thing.
 *
 * Nothing in a screen should hard-code a colour, a radius or a spacing value.
 */

/**
 * Semantic colours, defined per theme.
 *
 * Named by *role*, not by appearance: `surface`, `textMuted`, `danger` — never
 * `gray200` or `red`. A role can be re-themed; a colour name cannot.
 */
// A type alias rather than an interface: TypeScript infers an implicit index
// signature for aliases, which lets the CSS generator iterate a scheme with
// Object.entries without a cast.
export type ColorScheme = {
  /** Page background, behind everything. */
  readonly canvas: string;
  /** Cards, panels, table backgrounds. */
  readonly surface: string;
  /** Secondary surface: table header rows, inset panels. */
  readonly surfaceSubtle: string;
  /** Hover/selected background. */
  readonly surfaceHover: string;

  readonly border: string;
  readonly borderStrong: string;

  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  /** Text on a filled brand/semantic background. */
  readonly textInverse: string;

  readonly primary: string;
  readonly primaryHover: string;
  readonly primarySubtle: string;

  readonly success: string;
  readonly successSubtle: string;
  readonly warning: string;
  readonly warningSubtle: string;
  readonly danger: string;
  readonly dangerHover: string;
  readonly dangerSubtle: string;
  readonly info: string;
  readonly infoSubtle: string;

  /** Keyboard focus ring. Never removed, only restyled. */
  readonly focusRing: string;
};

const light: ColorScheme = {
  canvas: '#f6f7f8',
  surface: '#ffffff',
  surfaceSubtle: '#f1f3f5',
  surfaceHover: '#eceff2',

  border: '#e2e6ea',
  borderStrong: '#c8ced5',

  textPrimary: '#15181c',
  textSecondary: '#525a63',
  textMuted: '#7d858f',
  textInverse: '#ffffff',

  primary: '#0b6b62',
  primaryHover: '#095951',
  primarySubtle: '#e2f1ef',

  success: '#17754f',
  successSubtle: '#e3f3ec',
  warning: '#8a5a00',
  warningSubtle: '#fbf0dc',
  danger: '#b32418',
  dangerHover: '#961e14',
  dangerSubtle: '#fbe6e4',
  info: '#1a5f9e',
  infoSubtle: '#e5eff8',

  focusRing: '#0b6b62',
};

const dark: ColorScheme = {
  canvas: '#101317',
  surface: '#171b20',
  surfaceSubtle: '#1e232a',
  surfaceHover: '#252b33',

  border: '#2b323a',
  borderStrong: '#3c454f',

  textPrimary: '#eef1f4',
  textSecondary: '#a8b1bb',
  textMuted: '#7c858f',
  textInverse: '#0d1014',

  primary: '#4bbdaf',
  primaryHover: '#66cabd',
  primarySubtle: '#12312e',

  success: '#4cb98a',
  successSubtle: '#122a20',
  warning: '#d9a441',
  warningSubtle: '#2c2113',
  danger: '#f0776a',
  dangerHover: '#f58e83',
  dangerSubtle: '#2f1917',
  info: '#5ea6e8',
  infoSubtle: '#132534',

  focusRing: '#4bbdaf',
};

export const colors = { light, dark } as const;
export type ThemeName = keyof typeof colors;

/**
 * 4px base scale. Every margin, padding and gap comes from here — this is what
 * stops the "inconsistent spacing" the brief calls out.
 */
export const spacing = {
  0: 0,
  1: 2,
  2: 4,
  3: 8,
  4: 12,
  5: 16,
  6: 20,
  7: 24,
  8: 32,
  9: 40,
  10: 48,
  11: 64,
} as const;

/**
 * Deliberately shallow. The brief explicitly rejects "giant rounded cards
 * everywhere", so the scale tops out at 12px for containers.
 */
export const radius = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

export const fontSize = {
  /** Table metadata, timestamps. */
  xs: 12,
  sm: 13,
  /** Admin body text. 14px, not 16px — the admin is information-dense. */
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

export const lineHeight = {
  tight: 1.25,
  snug: 1.4,
  normal: 1.55,
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

export const fontFamily = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  /**
   * Money and meter readings. Tabular figures keep digits in vertical alignment
   * down a column, which is the difference between a scannable ledger and a mess.
   */
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

/** Two levels only. Elevation is for overlays, not decoration. */
export const shadow = {
  none: 'none',
  sm: '0 1px 2px rgba(16, 19, 23, 0.06), 0 1px 3px rgba(16, 19, 23, 0.04)',
  md: '0 4px 12px rgba(16, 19, 23, 0.10), 0 2px 4px rgba(16, 19, 23, 0.06)',
} as const;

/** Minimum accessible touch target (WCAG 2.5.5 / platform guidance). */
export const MIN_TOUCH_TARGET_PX = 44;

export const tokens = {
  colors,
  spacing,
  radius,
  fontSize,
  lineHeight,
  fontWeight,
  fontFamily,
  shadow,
} as const;
