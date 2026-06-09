// Shared Prettier config. Reference from a consuming repo via package.json:
//   "prettier": "devkit/prettier"
export default {
  semi: true,
  tabWidth: 2,
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'es5',
  bracketSameLine: false,
  endOfLine: 'auto',
};
