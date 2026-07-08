import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Personal, private outliner. Runs fully local — no backend, no telemetry.
export default defineConfig({
  plugins: [react()],
  // A stable, pinned origin (host + port) is important: the local database
  // lives in the browser keyed to this origin, so keeping it constant across
  // `dev` and `preview` means your notes are always found. strictPort makes a
  // busy port fail loudly instead of silently drifting to a new (empty) origin.
  server: {
    port: 5273,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 5273,
    strictPort: true,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
