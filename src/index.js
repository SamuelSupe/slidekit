import './style.css';
import { SlideEditor } from './editor.js';

export { createDocument, createElement, paragraph, validateDocument } from './document.js';
export { exportPptx } from './pptx.js';
export { DEFAULT_PDF_LIMITS } from './pdf.js';

/** @typedef {import('./types.js').Deck} Deck */
/** @typedef {import('./types.js').Slide} Slide */
/** @typedef {import('./types.js').SlideElement} SlideElement */
/** @typedef {import('./types.js').Gradient} Gradient */
/** @typedef {import('./types.js').Shadow} Shadow */
/** @typedef {import('./types.js').TextNode} TextNode */
/** @typedef {import('./types.js').EditorOptions} EditorOptions */
/** @typedef {import('./types.js').EditorEvent} EditorEvent */
/** @typedef {import('./types.js').PdfLimits} PdfLimits */
/** @typedef {{password?: string, signal?: AbortSignal, limits?: PdfLimits}} PdfImportOptions */
/** @typedef {{signal?: AbortSignal}} PptxImportOptions */
/** @typedef {{warnings: string[]}} PptxImportResult */
/**
 * @typedef {object} EditorHandle
 * @property {HTMLElement} element Editor root, for focus and host layout integration.
 * @property {() => Deck} getDocument Returns an owned snapshot including text being composed.
 * @property {(doc: Deck) => void} setDocument Loads a validated document and clears undo history.
 * @property {(file: File|Blob, options?: PdfImportOptions) => Promise<void>} importPdf Opens PDF pages as embedded images; replaces the deck only after successful conversion. Abort rejects without replacing it.
 * @property {(file: File|Blob, options?: PptxImportOptions) => Promise<PptxImportResult>} importPptx Opens supported editable PPTX objects atomically. Returns fidelity warnings; rejects damaged files or cancellation without replacing the deck.
 * @property {(properties?: {name?: string, background?: string, backgroundGradient?: Gradient|null, hidden?: boolean}, index?: number) => string} addSlide Inserts after the current page by default.
 * @property {(id?: string) => string} duplicateSlide
 * @property {(id: string, patch: {name?: string, background?: string, backgroundGradient?: Gradient|null, hidden?: boolean}) => void} updateSlide
 * @property {(id?: string) => void} deleteSlide Deleting the last page creates a blank page.
 * @property {(id: string, index: number) => void} moveSlide Uses a zero-based destination index.
 * @property {(id: string) => void} goToSlide
 * @property {(type: 'text'|'shape'|'image', properties?: Partial<SlideElement>) => string} addElement Adds to the current page.
 * @property {(id: string, patch: Partial<SlideElement>) => void} updateElement Updates an element on the current page.
 * @property {(ids?: string[]) => void} deleteElements Locked elements are preserved.
 * @property {(file: File|Blob, properties?: Partial<SlideElement>) => Promise<string>} addImage Embeds PNG/JPEG, normalizes WebP to PNG.
 * @property {(ids: string[]) => void} selectElements
 * @property {() => void} undo
 * @property {() => void} redo
 * @property {(mode: 'edit'|'view') => void} setMode
 * @property {() => Promise<void>} present
 * @property {() => void} exitPresent
 * @property {() => Promise<Blob>} exportPptx
 * @property {(event: EditorEvent, handler: (payload: any) => void) => () => void} on
 * @property {() => void} destroy Idempotent. Releases listeners, observers, controls and owned DOM.
 */

/**
 * Mount a self-contained editor inside an explicitly sized container.
 * Import @local/slidekit/style.css once in the host application.
 * Mutations in view mode and invalid documents throw without changing the deck.
 * @param {HTMLElement} container
 * @param {EditorOptions} [options]
 * @returns {EditorHandle}
 */
export function createEditor(container, options = {}) {
  const editor = new SlideEditor(container, options);
  const guard = action => (...args) => {
    if (editor.destroyed) throw new Error('编辑器已销毁');
    return action(...args);
  };
  const mutate = action => guard((...args) => {
    editor.store.assertEditable();
    editor.text.stop();
    return action(...args);
  });
  return {
    element: editor.root,
    getDocument: guard(() => editor.getDocument()),
    setDocument: guard(doc => editor.setDocument(doc)),
    importPdf: guard((file, options) => editor.importPdf(file, options)),
    importPptx: guard((file, options) => editor.importPptx(file, options)),
    addSlide: mutate((properties, index) => editor.store.addSlide(properties, index)),
    duplicateSlide: mutate(id => editor.store.duplicateSlide(id)),
    updateSlide: mutate((id, patch) => editor.store.updateSlide(id, patch)),
    deleteSlide: mutate(id => editor.store.deleteSlide(id)),
    moveSlide: mutate((id, index) => editor.store.moveSlide(id, index)),
    goToSlide: guard(id => editor.goToSlide(id)),
    addElement: mutate((type, properties) => editor.store.addElement(type, properties)),
    updateElement: mutate((id, patch) => editor.store.updateElement(id, patch)),
    deleteElements: mutate(ids => editor.store.deleteElements(ids)),
    addImage: guard((file, properties) => editor.addImage(file, properties)),
    selectElements: guard(ids => { editor.text.stop(); editor.store.selectElements(ids); }),
    undo: guard(() => editor.undo()),
    redo: guard(() => editor.redo()),
    setMode: guard(mode => { editor.text.stop(); editor.store.setMode(mode); }),
    present: guard(() => editor.present()),
    exitPresent: guard(() => editor.exitPresent()),
    exportPptx: guard(() => editor.exportPptx()),
    on: guard((event, handler) => {
      if (!['change', 'selectionChange', 'slideChange', 'error'].includes(event)) throw new Error('不支持的事件：' + event);
      return editor.store.on(event, handler);
    }),
    destroy: () => editor.destroy(),
  };
}
