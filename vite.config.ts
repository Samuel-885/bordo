import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Versão nova espera: nunca recarrega sozinha no meio da viagem (ver src/pwa.ts).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Bordo',
        short_name: 'Bordo',
        description: 'Acompanhe a viagem de ônibus, com ou sem internet.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#F3F5F2',
        background_color: '#F3F5F2',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tudo o que o build emite entra no cache: o app inteiro abre sem internet.
        // As fontes só em woff2 (os navegadores atuais usam esse formato).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // O jsPDF só usa estes três (conversão de HTML e SVG) fora do que o relatório precisa: ficam fora do cache.
        globIgnores: ['**/html2canvas-*.js', '**/purify.es-*.js', '**/index.es-*.js'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { host: '0.0.0.0' },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
