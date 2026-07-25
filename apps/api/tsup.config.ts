import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  // The production container is intentionally dependency-free at runtime.
  // Node built-ins remain external; all npm/workspace packages are bundled.
  noExternal: [/.*/],
})
