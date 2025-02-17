/** @type {import("prettier").Config} */
export default {
  arrowParens: 'always',
  semi: true,
  useTabs: false,
  tabWidth: 2,
  bracketSpacing: true,
  singleQuote: true,
  printWidth: 80,
  trailingComma: 'all',
  endOfLine: 'auto',
  plugins: ['prettier-plugin-sort-package-json'],
};
