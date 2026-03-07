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
