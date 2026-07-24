import { defineConfig } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)))

export default defineConfig({
  root,
  server: {
    host: true,
    port: 5175,
    open: '/',
  },
})
