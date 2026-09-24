import { defineConfig } from 'vite';
import { assetFileNames } from './scripts/pdf-assets.mjs';
export default defineConfig({ base: './', build: { outDir: 'site', rollupOptions: { output: { assetFileNames } } } });
