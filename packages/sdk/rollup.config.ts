import type { RollupOptions } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';

const external = ['kzg-wasm', 'ethers', 'crypto'];

const config: RollupOptions[] = [
  // Main build
  {
    input: 'src/index.ts',
    output: [
      {
        dir: 'dist',
        format: 'cjs',
        sourcemap: true,
        entryFileNames: 'index.js',
        preserveModules: true,
        preserveModulesRoot: 'src'
      },
      {
        dir: 'dist',
        format: 'es',
        sourcemap: true,
        entryFileNames: 'index.esm.js',
        preserveModules: false
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        exclude: ['**/*.test.ts', '**/*.spec.ts']
      })
    ],
    external
  },
  // Browser build
  {
    input: 'src/browser.ts',
    output: [
      {
        file: 'dist/browser.js',
        format: 'iife',
        name: 'BlobKit',
        sourcemap: true,
        inlineDynamicImports: true
      },
      {
        file: 'dist/browser.esm.js',
        format: 'es',
        sourcemap: true,
        inlineDynamicImports: true
      }
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        exclude: ['**/*.test.ts', '**/*.spec.ts']
      })
    ],
    external: ['ethers']
  },
  // Type definitions
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es'
    },
    plugins: [dts()]
  },
  {
    input: 'src/browser.ts',
    output: {
      file: 'dist/browser.d.ts',
      format: 'es'
    },
    plugins: [dts()]
  }
];

export default config;
