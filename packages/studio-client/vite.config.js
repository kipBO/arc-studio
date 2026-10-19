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
          const pathParts = id.split(/[\\\\/]/);
          const modulesIndex = pathParts.lastIndexOf('node_modules');
          const packageName = pathParts[modulesIndex + 1];
          if (['react', 'react-dom', 'scheduler'].includes(packageName)) return 'react-vendor';
          if (['emoji-picker-react', 'shipstyles'].includes(packageName)) return 'emoji-vendor';
          const sourceIndex = pathParts.lastIndexOf('src');
          const sourceParts = pathParts.slice(sourceIndex + 1);
          if (sourceIndex >= 0 && sourceParts[0] === 'components') return 'studio-components';
        }
      }
    }
  }
});
