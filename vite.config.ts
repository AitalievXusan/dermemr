import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В режиме разработки фронтенд (5173) проксирует API, медиа и WebSocket на сервер (3000).
const target = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    host: true,
    proxy: {
      '/api': target,
      '/media': target,
      '/m/': target,
      '/verify': target,
      '/guidelines': target,
      '/webhooks': target,
      '/ws': { target: target.replace('http', 'ws'), ws: true },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
