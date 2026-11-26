import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Matches the web build's constant so modules that branch on it load in tests.
  define: { __TOY__: 'false' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // One file at a time. The balance simulation asserts on how long a single simulated frame
    // takes, and with every other file starting up on the same cores the scheduler alone
    // stretches a 5 ms frame past the limit — the measurement is about the simulation, so it
    // needs the machine to itself. The suite is dominated by that one file, so running the
    // rest alongside it saved a few seconds at most.
    fileParallelism: false,
  },
});
