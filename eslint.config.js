import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

let tseslint = null

try {
  tseslint = await import('typescript-eslint')
} catch {
  tseslint = null
}

const typescriptConfig = tseslint
  ? [
      {
        files: ['**/*.{ts,tsx}'],
        extends: [
          js.configs.recommended,
          ...tseslint.configs.strict,
          reactHooks.configs.flat.recommended,
          reactRefresh.configs.vite,
        ],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            projectService: true,
            tsconfigRootDir: import.meta.dirname,
          },
          globals: {
            ...globals.browser,
            ...globals.node,
          },
        },
        rules: {
          '@typescript-eslint/no-non-null-assertion': 'error',
          'react-refresh/only-export-components': 'warn',
        },
      },
    ]
  : [
      {
        ignores: ['**/*.{ts,tsx}'],
      },
    ]

export default defineConfig([
  globalIgnores([
    'artifacts',
    'dist',
    'node_modules',
    'playwright-report',
    'test-results',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      'no-redeclare': 'warn',
      'no-useless-escape': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  ...typescriptConfig,
])
