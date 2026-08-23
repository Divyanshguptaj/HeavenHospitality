import { colors, fontFamily, fontSize, lineHeight, radius, shadow, spacing } from './tokens.js';

const kebab = (value: string): string => value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function declarations(prefix: string, values: Record<string, string | number>, unit = ''): string {
  return Object.entries(values)
    .map(([key, value]) => `  --${prefix}-${kebab(key)}: ${value}${value === 0 ? '' : unit};`)
    .join('\n');
}

/**
 * Emits the Tailwind v4 `@theme` block from the token values.
 *
 * The admin generates its stylesheet from this at build time rather than keeping a
 * hand-written copy, so the CSS and the TypeScript cannot drift apart. Mobile
 * imports the same token objects directly.
 *
 * Dark mode overrides only the colours — spacing, type and radius are invariant
 * across themes.
 */
export function buildThemeCss(): string {
  return `/*
 * GENERATED FILE — do not edit.
 * Source: packages/tokens. Regenerate with \`pnpm gen:theme\`.
 */

@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));

@theme {
${declarations('color', colors.light)}

${declarations('spacing', spacing, 'px')}

${declarations('radius', radius, 'px')}

${declarations('text', fontSize, 'px')}

${declarations('leading', lineHeight)}

${declarations('shadow', shadow)}

  --font-sans: ${fontFamily.sans};
  --font-mono: ${fontFamily.mono};
}

.dark {
${declarations('color', colors.dark)}
}
`;
}
