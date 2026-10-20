import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
//
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll(String.fromCharCode(92), '/');
          const pathParts = normalizedId.split('/');
          const modulesIndex = pathParts.lastIndexOf('node_modules');
          const packageName = pathParts[modulesIndex + 1];
          if (['react', 'react-dom', 'scheduler'].includes(packageName)) return 'react-vendor';
          if (normalizedId.includes('/emoji-picker-react/dist/data/emojis-en.js')) return 'emoji-data';
          if (['emoji-picker-react', 'shipstyles'].includes(packageName)) return 'emoji-vendor';
        }
      }
    }
  }
});
