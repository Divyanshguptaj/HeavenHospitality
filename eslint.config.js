import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // The foundation forbids `any` unless genuinely unavoidable; an explicit
      // eslint-disable with a reason is the escape hatch.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // Type-aware rules for the backend and shared packages. These are the places
  // where an unawaited promise or an unhandled rejection becomes a correctness
  // or money bug, so the stricter (slower) ruleset is worth it here.
  {
    files: ['apps/api/src/**/*.ts', 'packages/*/src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },

  // "No production console.log" — the API must log through pino so that output
  // is structured, redacted and carries a request id.
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },

  // Build-time Node scripts: plain ESM, not part of any app's tsconfig.
  {
    files: ['**/scripts/**/*.mjs', '**/scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Test files relax a few rules that only make sense in production paths.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'no-console': 'off',
    },
  },

  prettier,
);
