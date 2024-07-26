const typescript = require('rollup-plugin-typescript2');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');

module.exports = {
  input: 'main.ts',
  output: {
    dir: '.',
    sourcemap: 'inline',
    format: 'cjs',
    exports: 'default'
  },
  external: ['obsidian'],
  plugins: [
    typescript({
      tsconfig: "tsconfig.json",
      compilerOptions: {
        module: "esnext",
        target: "es6",
        inlineSourceMap: true,
        inlineSources: true,
        moduleResolution: "node",
        allowSyntheticDefaultImports: true,
        esModuleInterop: true
      }
    }),
    nodeResolve({ browser: true }),
    commonjs(),
  ]
};