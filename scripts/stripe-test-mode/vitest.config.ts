import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'node:path'

// Runs the real payment code against Stripe TEST mode and the shared database.
// Never run with live keys: every spec refuses to start unless STRIPE_SECRET_KEY is sk_test_.
//   npx vitest run --config scripts/stripe-test-mode/vitest.config.ts <spec>
export default defineConfig(({ mode }) => ({
  plugins: [tsconfigPaths({ root: path.resolve(__dirname, '../..') })],
  // '@' spelled out too: vite-tsconfig-paths stopped resolving it for this config.
  resolve: { alias: { 'server-only': path.resolve(__dirname, 'empty.ts'), '@': path.resolve(__dirname, '../..') } },
  test: {
    root: path.resolve(__dirname, '../..'),
    include: ['scripts/stripe-test-mode/**/*.e2e.ts'],
    environment: 'node',
    env: loadEnv(mode, path.resolve(__dirname, '../..'), ''),
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
}))
