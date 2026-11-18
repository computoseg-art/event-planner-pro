module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
  ],
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "no-await-in-loop": "warn",
    "no-console": "off",
  },
};
