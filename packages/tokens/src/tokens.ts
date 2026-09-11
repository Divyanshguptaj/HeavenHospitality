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
  canvas: '#f7f5f1',
  surface: '#ffffff',
  surfaceSubtle: '#f0ede7',
  surfaceHover: '#e8e3da',

  border: '#e3ded4',
  borderStrong: '#c7bfaf',

  textPrimary: '#14131a',
  textSecondary: '#4a4a54',
  textMuted: '#65646c',
  textInverse: '#ffffff',

  primary: '#a5621f',
  primaryHover: '#8f5319',
  primarySubtle: '#f6e7d4',

  success: '#3f7a4e',
  successSubtle: '#e3f0e5',
  warning: '#946200',
  warningSubtle: '#fbf1dc',
  danger: '#b33b2e',
  dangerHover: '#96301f',
  dangerSubtle: '#fbe8e4',
  info: '#2c6fa8',
  infoSubtle: '#e4eef6',

  focusRing: '#a5621f',
};

const dark: ColorScheme = {
  canvas: '#12141c',
  surface: '#1a1d27',
  surfaceSubtle: '#20242f',
  surfaceHover: '#272b38',

  border: '#2e3341',
  borderStrong: '#3f4657',

  textPrimary: '#f1efea',
  textSecondary: '#c6c4ce',
  textMuted: '#94929e',
  textInverse: '#14100d',

  primary: '#d99a52',
  primaryHover: '#e5ac6d',
  primarySubtle: '#3a2a18',

  success: '#5fa06d',
  successSubtle: '#16261a',
  warning: '#e0b84a',
  warningSubtle: '#2e2308',
  danger: '#e2685a',
  dangerHover: '#eb8478',
  dangerSubtle: '#301813',
  info: '#6fa8d8',
  infoSubtle: '#16232e',

  focusRing: '#d99a52',
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
