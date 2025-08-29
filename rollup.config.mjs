import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import json from '@rollup/plugin-json';

export default {
  input: 'index.mjs',
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    inlineDynamicImports: true,
    entryFileNames: 'index.mjs'
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    json(),
    terser()
  ],
  external: [
    'fs', 'path', 'os', 'process', 'child_process'
  ],
  preserveEntrySignatures: false,
};
