import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Base JS rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // React Hooks rules
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Shared rule overrides
  {
    rules: {
      // TypeScript — allow common patterns we use
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'error',

      // JS — keep code clean
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
      'no-duplicate-imports': 'error',

      // Disable rules that conflict with TypeScript
      'no-undef': 'off',
    },
  },

  // S3 type-scale guard (phone apps) — ban pasted px→rem font literals with
  // >4 decimals (e.g. text-[0.90625rem]). The sweep collapsed these onto the
  // named ramp; this keeps them from creeping back. Use a named utility
  // (text-xs/sm/base/lg/xl/2xl/3xl) or the deliberate text-[0.6875rem] floor.
  // NOTE: never fix this by adding a --text-* @theme ramp — in Tailwind v4 that
  // REDEFINES the text-xs/sm/base/lg utilities app-wide.
  {
    files: ['src/pay/**/*.{ts,tsx}', 'src/comm/**/*.{ts,tsx}', 'src/business/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'Literal[value=/\\[\\d*\\.\\d{5,}rem\\]/]',
          message: 'Pasted px→rem font literal (>4 decimals). Use a named scale step (text-xs/sm/base/lg/xl/2xl/3xl) or the text-[0.6875rem] floor (design-review S3).',
        },
        {
          selector: 'TemplateElement[value.raw=/\\[\\d*\\.\\d{5,}rem\\]/]',
          message: 'Pasted px→rem font literal (>4 decimals). Use a named scale step (text-xs/sm/base/lg/xl/2xl/3xl) or the text-[0.6875rem] floor (design-review S3).',
        },
      ],
    },
  },

  // Ignore compiled output and test fixtures
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.min.js',
      'coverage/**',
      'public/**',
      'uploads/**',
      'outputs/**',
    ],
  },
);
