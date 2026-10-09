import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

function appVersion() {
  const date = new Date().toISOString().slice(0, 10)
  try {
    const hash = execSync('git rev-parse --short HEAD').toString().trim()
    return `${hash} · ${date}`
  } catch {
    return date
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // Relative base works on GitHub Pages regardless of the repository name (hash router).
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    vueDevTools(),
    VitePWA({
      // prompt instead of auto-reloading so an update never interrupts a study session
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FSRS 記憶卡',
        short_name: 'FSRS 記憶卡',
        description: '離線優先的 FSRS 記憶卡',
        lang: 'zh-Hant',
        theme_color: '#5f93c4',
        background_color: '#eeedea',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\.(wasm|data)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'wasm', expiration: { maxEntries: 10 } },
          },
          {
            // OCR data and CDN binaries; the TTS models (huggingface) are already stored by
            // fetchCached, and caching them here too doubled the storage and memory use
            urlPattern: ({ url }) =>
              ['cdn.jsdelivr.net', 'tessdata.projectnaptha.com'].includes(url.hostname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-assets',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})
