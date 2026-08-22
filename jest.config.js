/**
 * `testEnvironment: 'node'` stays the DEFAULT, deliberately.
 *
 * Most of this package is browser-free arithmetic — the layout budget, the scope machine, the
 * conformance suite — and those suites are faster and stricter without a DOM: a module that reaches
 * for `window` fails there instead of quietly working. The component suites opt IN, one file at a
 * time, with an `@jest-environment jsdom` docblock. So adding components did not cost the pure tests
 * their environment.
 *
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  // GATES THAT AUDIT THE MONOREPO, NOT THIS PACKAGE.
  //
  // These three read `apps/web` — the consumer that this library was extracted out of. They are real
  // gates and they still run, in the monorepo, where the app they audit exists. Here they would read
  // a path that is not there and fail for the wrong reason, which is worse than not running: a red
  // suite that means "wrong checkout" trains people to ignore red.
  //
  // `boundary.spec.ts` is NOT in this list. Most of it audits this package, and only its final case
  // reaches into the app; that case is skipped from inside the file, where the reason is next to it.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/test/gates/hookPurity.spec.ts',
    '<rootDir>/test/gates/packageName.spec.ts',
    '<rootDir>/test/gates/packaging.spec.ts',
  ],

  // THE EXAMPLE IMPORTS THE PACKAGE BY NAME, because that is what a consumer writes and what
  // `example/serve.mjs` and `scripts/build-example.mjs` both resolve through the `exports` map. A
  // suite that mounts a host component out of `example/` has to resolve the same specifier, and
  // the self-reference would send it to `dist/` — an artefact that may be stale or absent while a
  // developer runs `npm test` alone. `tsconfig.test.json` carries the same mapping for the
  // compiler, so the two agree.
  moduleNameMapper: {
    '^lightweight-magic-charts$': '<rootDir>/src/index.ts',
  },

  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFilesAfterEnv: ['<rootDir>/test/setupMatchers.ts'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
