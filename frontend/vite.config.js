import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        // Game SPA (play.beatably.app)
        main: path.resolve(__dirname, 'index.html'),
        // Marketing landing page (beatably.app) — see netlify.toml host routing
        landing: path.resolve(__dirname, 'landing.html'),
      },
    },
  },
})
