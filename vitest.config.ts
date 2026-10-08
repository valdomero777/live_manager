import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  ssr: { resolve: { conditions: ['development'] } },
  test: {
    include: ['apps/**/*.spec.ts', 'packages/**/*.spec.ts'],
    environment: 'node',
    // e2e tests hash passwords with argon2 and boot the full app; dev machines may be busy.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['apps/server/src/domain/**', 'apps/server/src/application/**'],
      thresholds: { 'apps/server/src/domain/**': { lines: 80, functions: 80, branches: 80 } },
    },
  },
});
