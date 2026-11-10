import { defineConfig } from 'vite';
import commonjs from '@originjs/vite-plugin-commonjs';

export default defineConfig({
  root: '.',
  base: './',
  plugins: [commonjs()],
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: ['dicom-parser']
  },
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
