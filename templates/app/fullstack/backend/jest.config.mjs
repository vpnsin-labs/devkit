import base from '@vpnsin-labs/devkit/jest';

// The backend is ESM (`"type": "module"`) and uses explicit `.js` import
// specifiers. ts-jest runs tests as CommonJS, so we (1) strip the `.js` suffix
// from relative imports and (2) tell ts-jest to emit CommonJS for the test run.
/** @type {import('jest').Config} */
export default {
  ...base,
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'CommonJS', verbatimModuleSyntax: false } }],
  },
};
