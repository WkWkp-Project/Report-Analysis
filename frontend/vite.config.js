import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// dev: proxy /api → FastAPI ที่ port 8000 จึงไม่ติด CORS และเรียก path เดียวกันได้
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
