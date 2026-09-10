import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_BASE_URL ?? 'http://localhost:8787';

  // GitHub Pages serves a project site from /<repo>/, so built asset URLs need
  // that prefix or they resolve against the domain root and 404. The deploy
  // workflow passes BASE_PATH from actions/configure-pages; the default matches
  // the repo name, and a custom domain would set BASE_PATH=/ instead.
  // Dev is left at the root so the local server keeps its usual address, but
  // `vite preview` has to use the real prefix or it serves dist at / and every
  // asset request 404s. Vite reports command 'serve' for preview, hence the
  // explicit isPreview check.
  const rawBase = env.BASE_PATH ?? '/saytlook/';
  const base =
    command === 'build' || isPreview ? (rawBase.endsWith('/') ? rawBase : `${rawBase}/`) : '/';

  return {
    base,
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
