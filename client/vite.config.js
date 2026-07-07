import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Defaults to 5173 for local dev; honors PORT when set (e.g. preview tooling).
    port: Number(process.env.PORT) || 5173,
    // Proxy API calls to the Express backend during development so the frontend
    // never needs to know the backend URL (and never touches the Claude API key).
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
