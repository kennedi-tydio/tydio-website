import { defineConfig, configDefaults } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    // e2e/ is Playwright's (npm run test:e2e), not vitest's.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
