import { typescript } from '@festpass/config/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(typescript({ tsconfigRootDir: import.meta.dirname }));
