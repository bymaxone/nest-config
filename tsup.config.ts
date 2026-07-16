import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'testing/index': 'src/testing/index.ts'
  },
  format: ['esm', 'cjs'],
  dts: true,
  tsconfig: 'tsconfig.build.json',
  outDir: 'dist',
  outExtension: ({ format }) => ({
    js: format === 'esm' ? '.mjs' : '.cjs'
  }),
  external: [/^@nestjs\//, 'reflect-metadata', 'zod'],
  target: 'node24',
  clean: false,
  splitting: false,
  treeshake: true,
  sourcemap: false,
  minify: false
})
