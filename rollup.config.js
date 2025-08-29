import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default {
  input: 'index.mjs', // Entry point
  output: {
    dir: 'dist',
    format: 'esm', // or 'cjs' if you want CommonJS
    sourcemap: true,
    entryFileNames: '[name].js'
  },
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    terser()
  ],
  external: [
    '@azure/keyvault-secrets',
    '@azure/identity',
    'inquirer',
    'fs',
    'isomorphic-fetch',
    '@microsoft/microsoft-graph-client'
  ]
};