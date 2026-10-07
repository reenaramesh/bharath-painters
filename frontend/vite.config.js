import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { systemCopy } from '../tools/transliteration/vite-plugin.mjs'

export default defineConfig({
  plugins: [
    systemCopy(),
    react(),
    tailwindcss(),
  ],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
    },
  },
})
