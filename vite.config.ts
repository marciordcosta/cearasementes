import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Atualiza sozinho em segundo plano a cada novo deploy (sem precisar
      // que o usuário aceite um prompt) — evita ficar preso numa versão
      // antiga em cache, já que o Vercel republica a cada push.
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'ERP Ceará Sementes',
        short_name: 'ERP Ceará',
        description: 'Painel BI, Precificação, Conciliação Bancária e Gerenciamento — Ceará Sementes',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#10233F',
        theme_color: '#10233F',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
