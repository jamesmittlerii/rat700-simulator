import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites under /<repo>/, so the production build
// needs a matching base path. Preview also uses this base for testing.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'serve' ? '/' : '/rat700-simulator/',
  test: {
    environment: 'node',
  },
}))
