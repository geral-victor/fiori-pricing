// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import fioriTools from '@sap-ux/eslint-plugin-fiori-tools';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', 'eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    files: ['**/*.ts'],
    plugins: {
      'fiori-custom': fioriTools,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        // tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
