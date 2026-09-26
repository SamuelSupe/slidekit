import { createEditor, createDocument, createElement, paragraph, DEFAULT_PDF_LIMITS, SUPPORTED_LOCALES, exportPptx } from '@local/slidekit';
import type { Deck, EditorHandle, EditorOptions, EditorLocale, Gradient, PdfImportOptions, PptxImportResult } from '@local/slidekit';

const gradient: Gradient = { type: 'linear', angle: 0, scaled: true, rotateWithShape: true,
  stops: [{ offset: 0, color: '#ffffff', opacity: 1 }, { offset: 1, color: '#000000', opacity: 0.4 }] };
const doc: Deck = createDocument();
doc.slides[0].elements.push(createElement('text', { content: paragraph('中文 / English') }));
const options: EditorOptions = { document: doc, pdfLimits: DEFAULT_PDF_LIMITS, mode: 'edit', locale: 'en' };
const editor: EditorHandle = createEditor(document.createElement('div'), options);
const locale: EditorLocale = editor.getLocale();
editor.setLocale('ja');
const locales: readonly EditorLocale[] = SUPPORTED_LOCALES;
void locale; void locales;
const page = editor.addSlide({ hidden: true, backgroundGradient: gradient });
editor.updateSlide(page, { hidden: false });
const id = editor.addElement('shape', { shape: 'arrow', gradient, fillOpacity: 0.5, strokeOpacity: 0.4 });
editor.updateElement(id, { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], endArrow: 'stealth' });
const off = editor.on('change', () => { const saved: Deck = editor.getDocument(); void saved; });
const pdfOptions: PdfImportOptions = { signal: new AbortController().signal, limits: { maxPages: 3 } };
void editor.importPdf(new Blob(), pdfOptions);
const imported: Promise<PptxImportResult> = editor.importPptx(new Blob());
const exported: Promise<Blob> = exportPptx(doc);
void imported; void exported;
off(); editor.destroy();
