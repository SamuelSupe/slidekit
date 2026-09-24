import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url&no-inline';

// Keep PDF.js's original resource names: the worker requests fonts and CMaps by name.
const resources = import.meta.glob('../node_modules/pdfjs-dist/{cmaps,standard_fonts,wasm,iccs}/*', {
  eager: true, query: '?url&no-inline', import: 'default',
});
function resourceDirectory(name) {
  const entry = Object.entries(resources).find(([path]) => path.includes('/' + name + '/'));
  return new URL('./', new URL(entry[1], document.baseURI)).href;
}

export function loadPdf(data, password, assetsUrl) {
  const base = assetsUrl ? new URL(assetsUrl.endsWith('/') ? assetsUrl : assetsUrl + '/', document.baseURI).href : null;
  GlobalWorkerOptions.workerSrc = base ? new URL('pdf.worker.min.mjs', base).href : workerUrl;
  return getDocument({
    data, password,
    cMapUrl: base || resourceDirectory('cmaps'),
    standardFontDataUrl: base || resourceDirectory('standard_fonts'),
    wasmUrl: base || resourceDirectory('wasm'),
    iccUrl: base || resourceDirectory('iccs'),
    stopAtErrors: true,
    enableXfa: false,
  });
}
