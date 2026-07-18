import { defineConfig } from 'vitest/config';

// Default config: pure-logic unit tests only. No emulator, no network.
// Firestore Rules tests live in a separate config (vitest.rules.config.ts)
// because they require a running Firestore emulator to connect to.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/firestore.rules.test.ts', 'tests/emulator/**'],
    globals: true,
  },
});
