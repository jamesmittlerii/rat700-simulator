import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const root = dirname(fileURLToPath(import.meta.url))

// GitHub Pages serves project sites under /<repo>/, so the production build
// needs a matching base path. Preview also uses this base for testing.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'serve' ? '/' : '/rat700-simulator/',
  build: {
    rollupOptions: {
      input: {
        directory: resolve(root, 'index.html'),
        simulator: resolve(root, 'simulator/index.html'),
      },
    },
  },
  test: {
    environment: 'node',
  },
}))
