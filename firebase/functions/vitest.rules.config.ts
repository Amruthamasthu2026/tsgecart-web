import { defineConfig } from 'vitest/config';

// Firestore Rules tests only. Must be run with a live Firestore emulator
// reachable (via `npm run test:rules`, which wraps this in
// `firebase emulators:exec --only firestore`) — never as part of the plain
// `npm test` unit-test run.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/firestore.rules.test.ts'],
    globals: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
