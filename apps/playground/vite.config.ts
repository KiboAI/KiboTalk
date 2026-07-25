import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiOrigin = process.env.PLAYGROUND_API_ORIGIN ?? 'http://localhost:8787'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __PLAYGROUND_API_ORIGIN__: JSON.stringify(apiOrigin),
  },
  server: {
    proxy: {
      '/api': {
        target: apiOrigin,
        changeOrigin: true,
        ws: true,
      },
      '/stt': {
        target: apiOrigin,
        changeOrigin: true,
        ws: true,
      },
      '/llm': {
        target: apiOrigin,
        changeOrigin: true,
      },
    },
  },
})
