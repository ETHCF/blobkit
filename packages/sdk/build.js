#!/usr/bin/env node
import { build } from 'esbuild';
import { readFile } from 'fs/promises';

const pkg = JSON.parse(await readFile('./package.json', 'utf8'));
const external = Object.keys(pkg.dependencies || {});
const externalNodeBuiltins = ['crypto', 'fs'];

// Main build (ESM)
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2020',
  outfile: 'dist/index.js',
  external,
  sourcemap: true
});

// Main build (CJS)
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2020',
  outfile: 'dist/index.cjs',
  external,
  sourcemap: true
});

// Browser build (ESM)
await build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: 'dist/browser.js',
  external: [...external, ...externalNodeBuiltins],
  sourcemap: true
});

// Browser build (CJS)
await build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  outfile: 'dist/browser.cjs',
  external: [...external, ...externalNodeBuiltins],
  sourcemap: true
});

console.log('Build complete!');
