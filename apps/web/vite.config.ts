import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        app: 'index.html',
        legacyOriginCleanup: 'legacy-origin-cleanup.html',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        ws: true,
      },
      '/stt': {
        target: 'http://localhost:8787',
        ws: true,
      },
      '/llm': 'http://localhost:8787',
      '/session-review': 'http://localhost:8787',
    },
  },
})
