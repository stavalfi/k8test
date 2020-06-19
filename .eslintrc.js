module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    project: './packages/**/tsconfig.json',
  },
  env: {
    es6: true,
    node: true,
  },
  plugins: ['@typescript-eslint', 'json', 'prettier', 'jest', 'spellcheck', 'no-floating-promise'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:json/recommended',
    'prettier',
    'plugin:jest/recommended',
  ],
  globals: {
    globalThis: false, // means it is not writeable
  },
  rules: {
    'no-process-exit': 'error',
    'no-process-env': 'error',
    'no-console': 'error',
    'prettier/prettier': 'error',
    'no-unused-vars': 'off', // it is the same as @typescript-eslint/no-unused-vars which is on
    'jest/no-disabled-tests': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/member-delimiter-style': 'off',
    '@typescript-eslint/ban-ts-ignore': 'off',
    '@typescript-eslint/triple-slash-reference': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-floating-promise/no-floating-promise': 'error',
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        '@typescript-eslint/no-unused-vars': [
          2,
          {
            args: 'none',
          },
        ],
      },
    },
  ],
}
