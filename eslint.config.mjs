import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      '.agents/**',
      '.taste-skill/**',
      '**/dist/**',
      '**/generated/**',
      '**/coverage/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  {
    files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
    settings: { next: { rootDir: 'apps/web/' } },
  },
  js.configs.recommended,
  ...nextVitals.map((config) => ({
    ...config,
    files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
  })),
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/test/**/*.tsx'],
    rules: { '@next/next/no-img-element': 'off' },
  },

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
