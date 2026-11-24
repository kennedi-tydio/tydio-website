import { defineConfig, devices } from '@playwright/test'

// Browser tests against the local dev server (npm run dev), signed in as the
// Stripe test-mode accounts from scripts/stripe-test-mode (see e2e/README.md).
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
  },
})
