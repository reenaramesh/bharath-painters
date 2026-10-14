import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { systemCopy } from '../tools/transliteration/vite-plugin.mjs'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    systemCopy(),
    react(),
    tailwindcss(),
  ],
  build: {
    rolldownOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        uiPreview: fileURLToPath(new URL('./ui-preview.html', import.meta.url)),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
    },
  },
})
