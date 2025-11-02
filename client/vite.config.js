import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', // Explicitly bind to 127.0.0.1 to match Spotify redirect URI
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // Handle callback route for Spotify OAuth (future use)
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
})

