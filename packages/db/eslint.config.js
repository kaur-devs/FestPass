import { node } from '@festpass/config/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(node({ tsconfigRootDir: import.meta.dirname }));
