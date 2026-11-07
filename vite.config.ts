import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'apple-touch-icon.png', 'login-hero.jpg'],
      manifest: {
        name: 'AtelierPro',
        short_name: 'AtelierPro',
        description: 'Gestion des ateliers de couture : clients, mesures, devis, commandes et paiements.',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#1D4ED8',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}']
      }
    })
  ]
});
