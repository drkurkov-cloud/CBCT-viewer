import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  worker: {
    format: 'es'
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome136'
  }
});
