export function assetFileNames(asset) {
  return asset.originalFileNames?.some(path => path.includes('pdfjs-dist/'))
    ? 'pdf-assets/[name][extname]' : 'assets/[name]-[hash][extname]';
}
