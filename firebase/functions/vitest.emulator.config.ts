import { defineConfig } from 'vitest/config';

// Real Auth + Firestore + Functions emulator integration tests only. Must
// be run with live Auth, Firestore, and Functions emulators reachable (via
// `npm run test:emulator`, which wraps this in `firebase emulators:exec
// --only auth,firestore,functions`) — never as part of the plain `npm test`
// unit-test run, and never against a real Firebase project.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/emulator/**/*.test.ts'],
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
