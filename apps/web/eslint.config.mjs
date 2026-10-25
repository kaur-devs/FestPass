import { typescript } from '@festpass/config/eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...nextVitals,
  ...typescript({ tsconfigRootDir: import.meta.dirname }),
]);
