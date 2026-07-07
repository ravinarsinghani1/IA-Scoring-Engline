import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxy API calls to the Express backend during development so the frontend
    // never needs to know the backend URL (and never touches the Claude API key).
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
