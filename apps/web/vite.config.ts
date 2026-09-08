import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_BASE_URL ?? 'http://localhost:8787';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Proxy in dev so the app can use same-origin paths and never trips CORS.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/screenshots': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
