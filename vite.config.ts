import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Personal, private outliner. Runs fully local — no backend, no telemetry.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
