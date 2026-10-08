import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      complexity: ['error', 10],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['apps/server/src/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    files: ['packages/overlays/src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['apps/dashboard/src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: false,
        project: ['apps/dashboard/tsconfig.app.json', 'apps/dashboard/tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // Angular's static Validators (Validators.required) are flagged as unbound methods.
    rules: { '@typescript-eslint/unbound-method': 'off' },
  },
  {
    files: ['**/*.spec.ts', '**/test/**/*.ts'],
    rules: {
      'max-lines-per-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
