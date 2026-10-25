import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  deps: { alwaysBundle: [/^@festpass\//] },
});
