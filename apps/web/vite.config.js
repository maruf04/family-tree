import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Shared .env at the repository root; only VITE_* values reach the browser.
  envDir: '../../',
  server: {
    port: 5173,
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:4000' },
  },
});
