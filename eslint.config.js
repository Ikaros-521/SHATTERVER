import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // promo/ is local, gitignored tooling (Node scripts for recording promo clips). wechat/ is the
  // server-side cloud-function deployment unit (CommonJS, `wx-server-sdk`) — not game source.
  { ignores: ['dist/**', 'dist-verify/**', 'node_modules/**', 'promo/**', '.hyperframes/**', 'wechat/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // Test files may use loose assertions on purpose.
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // Repo tooling: plain Node ESM scripts (no bundler), so Node globals apply.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly', __dirname: 'readonly' },
    },
  },
);
