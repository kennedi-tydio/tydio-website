import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'node:path'

// Sends a matrix of everyday Tidy Tasks through the same checks as
// /api/validate-task (code rules, then the real OpenAI validator) and saves
// every result, so "vague" rejections of specific tasks can be spotted.
// Costs a few cents of gpt-4o-mini per run. Run from C:\ (uppercase):
//   npx vitest run --config scripts/task-vagueness-matrix/vitest.config.ts
export default defineConfig(({ mode }) => ({
  plugins: [tsconfigPaths({ root: path.resolve(__dirname, '../..') })],
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, '../stripe-test-mode/empty.ts'),
      '@': path.resolve(__dirname, '../..'),
    },
  },
  test: {
    root: path.resolve(__dirname, '../..'),
    include: ['scripts/task-vagueness-matrix/**/*.e2e.ts'],
    environment: 'node',
    env: loadEnv(mode, path.resolve(__dirname, '../..'), ''),
    testTimeout: 900_000,
  },
}))
