import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
  },
  build: {
    rollupOptions: {
      input: {
        root: resolve(__dirname, 'index.html'),
        en: resolve(__dirname, 'en/index.html'),
        ja: resolve(__dirname, 'ja/index.html'),
        zh: resolve(__dirname, 'zh/index.html'),
      },
    },
  },
})
