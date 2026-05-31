import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['pretty-cougars-learn.loca.lt'],
    // 開發時把 API 與 WebSocket 代理到後端 :3001，讓前端一律用相對路徑
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
