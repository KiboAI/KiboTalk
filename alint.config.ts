import { createApeiraAdapter } from '@alint-js/agent-apeira'
import { defineConfig } from '@alint-js/cli'
import jsPlugin from '@alint-js/plugin-js'
import simplicityPlugin from '@alint-js/plugin-simplicity'

/**
 * KiboTalk alint 配置（规则源自 AIRI 本地配置）。
 * Provider 只用 DeepSeek：
 *   alint --model deepseek/deepseek-v4-flash PATHS
 */
export default defineConfig([
  {
    agent: createApeiraAdapter(),
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    ignore: {
      gitignore: true,
    },
    plugins: {
      js: jsPlugin,
    },
    rules: {
      // Local model review — works with DeepSeek non-thinking
      'js/inline-miniature-normalizer': 'warn',
      'js/no-private-schema-toolkit': 'warn',
      'js/no-redundant-binding': 'error',
      'js/no-single-use-materialization': 'error',
      'js/no-redundant-jsdoc': 'error',
      'js/no-trivial-wrapper-stack': 'error',
      'js/no-vacuous-function': 'error',

      // Repo-aware agent rules: DeepSeek often skips submit_review → run fails.
      // Re-enable when agent/tool-loop is reliable for this provider.
      'js/no-duplicated-knowledge': 'off',
      'js/no-overlapping-entrypoints': 'off',
      'js/no-redundant-catch': 'off',
      'js/no-test-only-production-wrapper': 'off',
      'js/no-mixed-layers-without-abstraction': 'off',
    },
  },
  {
    agent: createApeiraAdapter(),
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,rs,go,py}'],
    ignore: {
      gitignore: true,
    },
    language: 'plaintext',
    plugins: {
      simplicity: simplicityPlugin,
    },
    rules: {
      'simplicity/no-duplicated-helper': 'error',
      'simplicity/no-needless-helper': 'error',
    },
    settings: {
      simplicity: {
        ignores: [
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.spec.ts',
          '**/*.spec.tsx',
          '**/fixtures/**',
        ],
        judge: true,
        maxLines: 10,
        minTokens: 5,
      },
    },
  },
])
