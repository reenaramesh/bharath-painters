import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { systemCopy } from '../tools/transliteration/vite-plugin.mjs'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:8000'
  return ({
  plugins: [
    systemCopy(),
    react(),
    tailwindcss(),
  ],
  build: {
    rolldownOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': backendTarget,
      '/media': backendTarget,
    },
  },
  })
})
