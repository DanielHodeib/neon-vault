// Compiles server.ts (+ game/ and lib/) into dist/server.js, so production starts plain `node` instead of
// transpiling TypeScript on every boot. node_modules stay external; the "@/" paths come from tsconfig.json.
import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  packages: 'external',
  sourcemap: 'linked',
  logLevel: 'info',
});
