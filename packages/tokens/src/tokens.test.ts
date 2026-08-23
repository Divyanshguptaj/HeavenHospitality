import { describe, expect, it } from 'vitest';

import { buildThemeCss } from './css.js';
import { colors, radius, spacing, type ColorScheme } from './tokens.js';

/** Relative luminance per WCAG 2.x. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('colour tokens', () => {
  const themes = Object.entries(colors) as ReadonlyArray<[string, ColorScheme]>;

  it('defines every role as a 6-digit hex in both themes', () => {
    for (const [name, scheme] of themes) {
      for (const [role, value] of Object.entries(scheme)) {
        expect(value, `${name}.${role}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('defines the same roles in light and dark', () => {
    expect(Object.keys(colors.light).sort()).toEqual(Object.keys(colors.dark).sort());
  });

  // The brief requires WCAG-style contrast and forbids colour-only status
  // communication; body text failing contrast is the most common way that breaks.
  it('meets WCAG AA (4.5:1) for primary text on surfaces', () => {
    for (const [name, scheme] of themes) {
      expect(
        contrastRatio(scheme.textPrimary, scheme.surface),
        `${name} primary/surface`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(scheme.textPrimary, scheme.canvas),
        `${name} primary/canvas`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('meets WCAG AA for secondary text', () => {
    for (const [name, scheme] of themes) {
      expect(
        contrastRatio(scheme.textSecondary, scheme.surface),
        `${name} secondary/surface`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('meets WCAG AA for text on filled semantic backgrounds', () => {
    for (const [name, scheme] of themes) {
      for (const role of ['primary', 'danger'] as const) {
        expect(
          contrastRatio(scheme.textInverse, scheme[role]),
          `${name} inverse/${role}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('scales', () => {
  it('keeps container radii shallow, per the visual brief', () => {
    expect(radius.xl).toBeLessThanOrEqual(12);
  });

  it('increases monotonically', () => {
    const values = Object.values(spacing);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThan(values[index - 1] as number);
    }
  });
});

describe('buildThemeCss', () => {
  const css = buildThemeCss();

  it('emits a Tailwind theme block with kebab-cased custom properties', () => {
    expect(css).toContain('@theme');
    expect(css).toContain('--color-text-primary: #15181c;');
    expect(css).toContain('--color-surface-subtle:');
  });

  it('emits a dark override block', () => {
    expect(css).toContain('.dark {');
    expect(css).toContain(colors.dark.canvas);
  });

  it('applies the dark palette from the OS preference, not only a .dark class', () => {
    // Nothing sets .dark today, so without the media query the entire dark
    // palette would be unreachable and dark-mode users would get light surfaces
    // behind dark browser form controls.
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not(.light)');
  });

  it('adds units only where a unit is meaningful', () => {
    expect(css).toContain('--radius-md: 6px;');
    expect(css).toContain('--spacing-0: 0;');
    expect(css).toContain('--leading-tight: 1.25;');
  });

  it('marks itself as generated so nobody edits the output', () => {
    expect(css).toContain('GENERATED FILE');
  });
});
