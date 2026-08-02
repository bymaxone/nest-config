import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'internal/index': 'src/internal/index.ts',
    'testing/index': 'src/testing/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  tsconfig: 'tsconfig.build.json',
  outDir: 'dist',
  outExtension: ({ format }) => ({
    js: format === 'esm' ? '.mjs' : '.cjs'
  }),
  // The package's own subpaths lead the list. Entry points are separate bundles,
  // so a module two of them reach by a relative path is copied into each, and a
  // copied class is a different injection token and a different `instanceof`
  // target. Keeping the specifier external makes the shared runtime a single
  // bundle both entries import, in CommonJS as well as ESM — which code
  // splitting could not do, since esbuild splits ESM only.
  external: [/^@bymax-one\/nest-config\//, /^@nestjs\//, 'reflect-metadata', 'zod'],
  target: 'node24',
  clean: false,
  splitting: false,
  treeshake: true,
  sourcemap: false,
  minify: false
})
