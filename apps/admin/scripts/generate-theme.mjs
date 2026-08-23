// Generates the Tailwind theme from @heaven/tokens.
//
// The output is git-ignored and regenerated before dev/build/typecheck, so the
// stylesheet and the TypeScript tokens cannot drift apart. Edit the tokens
// package, never the generated file.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildThemeCss } from '@heaven/tokens';

const outputPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'styles',
  'theme.generated.css',
);

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, buildThemeCss(), 'utf8');

process.stdout.write(`theme written to ${path.relative(process.cwd(), outputPath)}\n`);
