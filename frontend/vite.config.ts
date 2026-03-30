import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-router-dom")) return "router"
            if (id.includes("@base-ui") || id.includes("lucide-react") || id.includes("sonner")) {
              return "ui"
            }
            if (id.includes("react")) return "react-vendor"
          }
        },
      },
    },
  },
  server: {
    proxy: {
      "/auth": "http://127.0.0.1:8000",
      "/stores": "http://127.0.0.1:8000",
      "/products": "http://127.0.0.1:8000",
      "/orders": "http://127.0.0.1:8000",
      "/deliveries": "http://127.0.0.1:8000",
      "/demo": "http://127.0.0.1:8000",
      "/docs": "http://127.0.0.1:8000",
      "/openapi.json": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
    },
  },
})
