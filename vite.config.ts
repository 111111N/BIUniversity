import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getVendorChunk } from './build/chunks.ts';

export default defineConfig({
  plugins: [react()],
  build: {
    modulePreload: { polyfill: false },
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: getVendorChunk,
        // Keep each vendor's private helpers with it; the build check rejects static chunk cycles.
        onlyExplicitManualChunks: false,
      },
    },
  },

});
