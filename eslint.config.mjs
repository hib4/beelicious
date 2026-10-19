import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/dist/**', '**/generated/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
);
