// Base Jest config for TypeScript (Node) projects, via ts-jest.
//   // jest.config.mjs
//   export { default } from 'ladevconfig/jest';
//
// To extend:
//   import base from 'ladevconfig/jest';
//   export default { ...base, setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'] };
//
// Requires `jest`, `ts-jest` and `@types/jest` in the consuming repo (the
// `ladevconfig init --jest` CLI installs them). Next.js apps should instead use
// `next/jest` to wire up SWC + module aliases.
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(test|spec).[tj]s?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  clearMocks: true,
};
