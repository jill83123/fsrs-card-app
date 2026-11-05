import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so tests don't load the PWA / devtools plugins.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/__tests__/**/*.test.ts'], environment: 'node' },
})
