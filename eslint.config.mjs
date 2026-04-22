import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const coreWebVitals = require('eslint-config-next/core-web-vitals');

const config = [
  ...coreWebVitals,
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'dist/**', 'coverage/**', 'scripts/outputs/**'],
    rules: {
      // App Router layouts often include <link> tags directly; keep this as a warning-free baseline.
      '@next/next/no-page-custom-font': 'off',
    },
  },
];

export default config;

