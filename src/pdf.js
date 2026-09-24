import { createDocument, createElement, emptySlide, MAX_SLIDES, uid, validateDocument } from './document.js';

const MB = 1024 * 1024;
/** @type {Readonly<Required<import('./types.js').PdfLimits>>} */
export const DEFAULT_PDF_LIMITS = Object.freeze({ maxFileSizeMB: 200, maxPages: MAX_SLIDES, maxRenderedSizeMB: 500 });
const sizeInMB = bytes => Math.ceil(bytes / MB * 100) / 100;

/** @param {...import('./types.js').PdfLimits} overrides */
export function resolvePdfLimits(...overrides) {
  const limits = { ...DEFAULT_PDF_LIMITS };
  for (const override of overrides) {
    if (override === undefined) continue;
    if (!override || typeof override !== 'object' || Array.isArray(override)) throw new TypeError('PDF 导入限制必须是对象');
    for (const [key, value] of Object.entries(override)) {
      if (!Object.hasOwn(limits, key)) throw new TypeError('未知的 PDF 导入限制：' + key);
      if (!Number.isFinite(value) || value <= 0 || value * MB > Number.MAX_SAFE_INTEGER) throw new TypeError('PDF 导入限制 ' + key + ' 必须是有效的正数');
      if (key === 'maxPages' && (!Number.isInteger(value) || value > MAX_SLIDES)) throw new TypeError('PDF 页数上限须为 1–' + MAX_SLIDES + ' 的整数');
      limits[key] = value;
    }
  }
  return limits;
}

/**
 * Fit mixed PDF page sizes without stretching, using the first page's aspect ratio.
 * @param {number} width
 * @param {number} height
 * @param {{width: number, height: number}} [pageSize]
 */
export function pdfPageLayout(width, height, pageSize) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error('PDF 页面尺寸无效');
  const scale = 1280 / Math.max(width, height);
  const size = pageSize || { width: Math.max(100, width * scale), height: Math.max(100, height * scale) };
  const fit = Math.min(size.width / width, size.height / height);
  return {
    pageSize: size,
    x: (size.width - width * fit) / 2, y: (size.height - height * fit) / 2,
    width: width * fit, height: height * fit,
  };
}

/**
 * Render locally; the caller replaces its document only after every page succeeds.
 * @param {File | Blob} file
 * @param {{password?: string, signal?: AbortSignal, assetsUrl?: string, limits?: import('./types.js').PdfLimits, onProgress?: (progress: {page: number, total: number}) => void, onPassword?: (incorrect: boolean) => string | Promise<string>}} [options]
 * @returns {Promise<import('./types.js').Deck>}
 */
export async function readPdf(file, { password, signal, assetsUrl, limits: customLimits, onProgress, onPassword } = {}) {
  const limits = resolvePdfLimits(customLimits);
  if (!(file instanceof Blob) || !file.size) throw new Error('请选择有效的 PDF 文件');
  if (file.size > limits.maxFileSizeMB * MB) throw new Error('PDF 文件为 ' + sizeInMB(file.size) + ' MB，超过当前 ' + limits.maxFileSizeMB + ' MB 上限');
  signal?.throwIfAborted();
  const data = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(data.subarray(0, 1024)).includes('%PDF-')) throw new Error('文件不是有效的 PDF');
  const { loadPdf } = await import('./pdf-engine.js');
  signal?.throwIfAborted();
  const task = loadPdf(data, password, assetsUrl);
  let renderTask;
  let cleanup;
  const close = () => {
    renderTask?.cancel();
    cleanup ||= task.destroy();
    return cleanup;
  };
  const abort = () => { close().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  if (onPassword) task.onPassword = (update, reason) => {
    Promise.resolve(onPassword(reason === 2)).then(value => {
      if (!signal?.aborted) update(value);
    }).catch(abort);
  };
  const name = (file.name || 'PDF 文稿').replace(/\.pdf$/i, '').slice(0, 500);
  const doc = createDocument(name || 'PDF 文稿');
  doc.slides = [];
  let imageBytes = 0;
  try {
    const pdf = await task.promise;
    if (pdf.numPages > limits.maxPages) throw new Error('PDF 共 ' + pdf.numPages + ' 页，超过当前 ' + limits.maxPages + ' 页上限，请拆分或提高导入上限');
    for (let index = 1; index <= pdf.numPages; index++) {
      signal?.throwIfAborted();
      onProgress?.({ page: index, total: pdf.numPages });
      const page = await pdf.getPage(index);
      const natural = page.getViewport({ scale: 1 });
      const layout = pdfPageLayout(natural.width, natural.height, index === 1 ? null : doc);
      if (index === 1) Object.assign(doc, layout.pageSize);
      const renderScale = Math.min(2560 / Math.max(natural.width, natural.height), Math.sqrt(4000000 / (natural.width * natural.height)));
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      try {
        renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' });
        await renderTask.promise;
        signal?.throwIfAborted();
        const dataUrl = canvas.toDataURL('image/png');
        imageBytes += dataUrl.length;
        if (imageBytes > limits.maxRenderedSizeMB * MB) throw new Error('PDF 渲染到第 ' + index + ' 页累计 ' + sizeInMB(imageBytes) + ' MB 图像数据，超过当前 ' + limits.maxRenderedSizeMB + ' MB 上限，请拆分或提高导入上限');
        const assetId = uid();
        doc.assets[assetId] = { data: dataUrl, width: canvas.width, height: canvas.height, name: name + '-' + index + '.png' };
        const slide = emptySlide('PDF 第 ' + index + ' 页');
        const { x, y, width, height } = layout;
        slide.elements.push(createElement('image', { assetId, x, y, width, height, fit: 'contain', locked: true }));
        doc.slides.push(slide);
      } finally {
        renderTask = null;
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
    }
    return validateDocument(doc);
  } catch (error) {
    signal?.throwIfAborted();
    if (error.name === 'PasswordException') throw new Error('PDF 需要正确的打开密码');
    if (error.name === 'InvalidPDFException') throw new Error('PDF 已损坏或格式不受支持');
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    await close();
  }
}
