// @ts-check
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';

const external = ['kzg-wasm', 'ethers', 'axios', 'crypto'];

/** @type {import('rollup').RollupOptions[]} */
const config = [
  // Main build
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.js',
        format: 'es',
        sourcemap: true
      },
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named'
      }
    ],
    plugins: [
      resolve({
        preferBuiltins: true
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
        module: 'esnext',
        declaration: false,
        declarationMap: false
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
        format: 'es',
        sourcemap: true
      },
      {
        file: 'dist/browser.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named'
      }
    ],
    plugins: [
      resolve({
        preferBuiltins: false,
        browser: true
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
        module: 'esnext',
        declaration: false,
        declarationMap: false
      })
    ],
    external
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
