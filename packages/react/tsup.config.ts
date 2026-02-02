import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: {
    resolve: ['@privacykit/sdk'],
  },
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  minify: false,
  external: [
    'react',
    '@solana/web3.js',
    '@solana/wallet-adapter-react',
    '@privacykit/sdk',
  ],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
