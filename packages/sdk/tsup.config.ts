import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  minify: false,
  external: [
    '@solana/web3.js',
    '@noir-lang/noir_js',
    '@noir-lang/backend_barretenberg',
    '@noir-lang/types',
    '@arcium-hq/client',
    '@arcium-hq/reader',
    'circomlibjs',
    'snarkjs',
    'ffjavascript',
  ],
});
