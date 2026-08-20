// -----------------------------------------------------------------------------
// ESLint flat config (ESLint 9+). Catches real mistakes without fighting
// Prettier over formatting (eslint-config-prettier turns off stylistic rules).
// -----------------------------------------------------------------------------

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/', 'data/'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  prettier,
];
