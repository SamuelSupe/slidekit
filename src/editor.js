import { DocumentStore } from './store.js';
import { RichTextSession } from './rich-text.js';
import { Gestures } from './gestures.js';
import { Toolbar } from './toolbar.js';
import { Panels } from './panels.js';
import { dom, renderSlide, renderElement, positionElement, paintBackground, readImage, download } from './render.js';
import { isColor, validateDocument } from './document.js';
import { alignElements, distributeElements } from './geometry.js';
import { button } from './ui-controls.js';
import { exportPptx } from './pptx.js';
import { readPdf, resolvePdfLimits } from './pdf.js';
import { readPptx } from './pptx-import.js';
import { createImportDialog } from './import-dialog.js';
import { createTranslator, translateMessage, SUPPORTED_LOCALES } from './i18n.js';

let clipboard = null;

export class SlideEditor {
  constructor(container, options = {}) {
    if (!(container instanceof HTMLElement)) throw new TypeError('container 必须是 HTMLElement');
    this.locale = options.locale === undefined ? 'zh-CN' : options.locale;
    this.t = createTranslator(this.locale);
    this.options = options;
    this.pdfLimits = resolvePdfLimits(options.pdfLimits);
    this.store = new DocumentStore(options.document, options.mode, (...args) => this.t(...args));
    this.destroyed = false;
    this.zoom = 1;
    this.autoFit = true;
    this.abort = new AbortController();
    this.root = dom('div', 'slidekit');
    this.root.lang = this.locale;
    this.root.tabIndex = 0;
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', this.t('SlideKit 幻灯片编辑器'));
    if (options.theme?.accent) {
      if (!isColor(options.theme.accent)) throw new Error('主题色须为六位十六进制颜色');
      this.root.style.setProperty('--sk-accent', options.theme.accent);
    }
    this.text = new RichTextSession(this);
    this.viewport = dom('div', 'sk-workspace');
    this.stage = dom('div', 'sk-stage-wrap');
    this.world = dom('div', 'sk-world');
    this.canvas = dom('div', 'sk-slide');
    this.canvas.setAttribute('aria-label', this.t('幻灯片画布'));
    this.world.append(this.canvas);
    this.stage.append(this.world);
    this.viewport.append(this.stage);
    this.panels = new Panels(this);
    this.toolbar = new Toolbar(this);
    this.main = dom('div', 'sk-main');
    this.main.append(this.panels.left, this.viewport, this.panels.right);
    this.status = this.createStatus();
    this.toast = dom('div', 'sk-toast');
    this.toast.setAttribute('role', 'status');
    this.root.append(...this.toolbar.nodes, this.main, this.status, this.toast);
    if (options.ui?.toolbar === false) this.toolbar.nodes.forEach(node => { node.hidden = true; });
    if (options.ui?.thumbnails === false) this.root.classList.add('sk-hide-thumbnails');
    if (options.ui?.inspector === false) this.root.classList.add('sk-hide-inspector');
    container.append(this.root);
    this.renderCanvas();
    this.gestures = new Gestures(this);
    this.store.on('change', ({ reason }) => {
      if (reason === 'undo' || reason === 'redo') this.text.restore();
      this.renderCanvas();
      this.toolbar.update();
      this.panels.renderInspector();
      this.scheduleThumbnails();
      this.updateStatus();
      if (this.autoFit) this.fit();
    });
    this.store.on('selectionChange', () => {
      this.root.querySelectorAll('.sk-element').forEach(node => node.classList.toggle('sk-selected', this.store.selected.includes(node.dataset.elementId)));
      this.gestures.refresh();
      this.panels.renderInspector();
      this.toolbar.updateText();
      this.updateStatus();
    });
    this.store.on('slideChange', ({ id }) => {
      if (this.renderedSlide !== id) { this.renderCanvas(); this.panels.renderInspector(); }
      this.scheduleThumbnails();
      this.updateStatus();
    });
    this.store.on('modeChange', () => {
      this.renderCanvas(); this.toolbar.update(); this.panels.renderInspector(); this.scheduleThumbnails(); this.gestures.refresh();
    });
    this.listen();
    this.observer = new ResizeObserver(() => {
      if (this.presentation) this.renderPresentation();
      else if (this.autoFit) this.fit();
      else this.gestures.refresh();
    });
    this.observer.observe(this.viewport);
    this.panels.renderThumbnails();
    this.panels.renderInspector();
    this.fit();
  }
  run(action) {
    try {
      const result = action();
      if (result?.catch) return result.catch(error => this.report(error));
      return result;
    } catch (error) { this.report(error); }
  }
  report(error) {
    if (this.destroyed) return;
    this.notify(error.message || String(error));
    this.store.emit('error', { error, message: this.message(error.message || String(error)) });
  }
  message(message) { return translateMessage(message, this.t); }
  notify(message) {
    if (this.destroyed) return;
    this.toastMessage = message;
    this.toast.textContent = this.message(message);
    this.toast.classList.add('sk-visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('sk-visible'), 3500);
  }
  setLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) throw new TypeError(this.t('不支持的界面语言：{locale}', { locale: String(locale) }));
    const t = createTranslator(locale);
    if (locale === this.locale) return;
    this.locale = locale;
    this.t = t;
    this.root.lang = locale;
    this.importDialog?.refresh();
    this.refreshLocale();
  }
  refreshLocale() {
    if (this.destroyed) return;
    const active = document.activeElement;
    // Let native form edits (including IME) finish before replacing their controls.
    // The slide's contenteditable node is never recreated by a language change.
    if (this.documentImport || (this.root.contains(active) && !this.canvas.contains(active) && active.matches('input,select,textarea'))) {
      this.localePending = true;
      return;
    }
    this.localePending = false;
    this.root.setAttribute('aria-label', this.t('SlideKit 幻灯片编辑器'));
    this.canvas.setAttribute('aria-label', this.t('幻灯片画布'));
    const previousToolbar = this.toolbar;
    this.toolbar = new Toolbar(this);
    previousToolbar.nodes.forEach((node, index) => {
      this.toolbar.nodes[index].hidden = node.hidden;
      node.replaceWith(this.toolbar.nodes[index]);
    });
    const status = this.createStatus();
    this.status.replaceWith(status); this.status = status;
    this.panels.renderThumbnails(); this.panels.renderInspector(); this.updateStatus();
    if (this.text.editor) {
      const props = this.text.editor.options.editorProps;
      this.text.editor.setOptions({ editorProps: { ...props, attributes: { ...props.attributes, 'aria-label': this.t('编辑幻灯片文字') } } });
    }
    if (this.toastMessage) this.toast.textContent = this.message(this.toastMessage);
    this.showImportWarnings(this.importWarnings || []);
    this.renderPresentation();
  }
  createStatus() {
    const status = dom('footer', 'sk-status');
    this.pageLabel = dom('span');
    this.selectionLabel = dom('span', 'sk-selection-label');
    const zoom = dom('div', 'sk-zoom');
    this.zoomLabel = button('100%', null, () => this.fit(), 'sk-zoom-label');
    this.zoomLabel.title = this.t('适应窗口');
    const slider = dom('input');
    slider.type = 'range'; slider.min = '10'; slider.max = '200'; slider.step = '5';
    slider.setAttribute('aria-label', this.t('画布缩放'));
    slider.addEventListener('input', () => this.setZoom(Number(slider.value) / 100));
    this.zoomSlider = slider;
    zoom.append(button(this.t('缩小'), 'minus', () => this.setZoom(this.zoom - 0.1), 'sk-icon-only'), slider,
      button(this.t('放大'), 'plus', () => this.setZoom(this.zoom + 0.1), 'sk-icon-only'), this.zoomLabel,
      button(this.t('适应窗口'), 'fit', () => this.fit(), 'sk-icon-only'));
    status.append(this.pageLabel, this.selectionLabel, zoom);
    return status;
  }
  updateStatus() {
    const index = this.store.doc.slides.findIndex(slide => slide.id === this.store.slideId);
    this.pageLabel.textContent = this.t('第 {page} / {total} 页', { page: index + 1, total: this.store.doc.slides.length });
    this.selectionLabel.textContent = this.store.selected.length ? this.t('已选中 {count} 个元素', { count: this.store.selected.length }) :
      [this.store.doc.width, this.store.doc.height].map(value => Math.round(value * 100) / 100).join(' × ');
    this.zoomLabel.firstChild.textContent = Math.round(this.zoom * 100) + '%';
    this.zoomLabel.setAttribute('aria-label', this.t('{zoom}%，点击适应窗口', { zoom: Math.round(this.zoom * 100) }));
    this.zoomSlider.value = String(Math.round(this.zoom * 100));
  }
  scheduleThumbnails() {
    if (this.thumbnailFrame) return;
    this.thumbnailFrame = requestAnimationFrame(() => {
      this.thumbnailFrame = null;
      if (!this.destroyed) this.panels.renderThumbnails();
    });
  }
  renderCanvas() {
    if (this.destroyed) return;
    const { doc, slide } = this.store;
    this.canvas.style.width = doc.width + 'px';
    this.canvas.style.height = doc.height + 'px';
    paintBackground(this.canvas, slide, doc);
    const nodes = slide.elements.map(element => {
      const editing = element.id === this.text.id ? this.elementNode(element.id) : null;
      if (editing) { positionElement(editing, element); return editing; }
      return renderElement(element, doc.assets);
    });
    // Moving an active contenteditable node resets its native selection and IME.
    const editingNode = this.text.id && this.elementNode(this.text.id);
    if (!editingNode || !nodes.includes(editingNode)) this.canvas.replaceChildren(...nodes);
    else {
      const wanted = new Set(nodes);
      for (const child of [...this.canvas.children]) if (!wanted.has(child)) child.remove();
      nodes.forEach((node, index) => {
        if (node !== editingNode && this.canvas.children[index] !== node) this.canvas.insertBefore(node, this.canvas.children[index] || null);
      });
    }
    this.renderedSlide = slide.id;
    this.world.style.width = doc.width + 'px'; this.world.style.height = doc.height + 'px';
    this.applyZoom();
    this.gestures?.refresh();
  }
  elementNode(id) { return [...this.canvas.children].find(node => node.dataset.elementId === id); }
  applyZoom() {
    this.world.style.transform = 'scale(' + this.zoom + ')';
    this.stage.style.width = this.store.doc.width * this.zoom + 'px';
    this.stage.style.height = this.store.doc.height * this.zoom + 'px';
  }
  fit() {
    this.autoFit = true;
    const { width, height } = this.viewport.getBoundingClientRect();
    this.zoom = Math.max(0.1, Math.min(1.5, (width - 80) / this.store.doc.width, (height - 80) / this.store.doc.height));
    this.applyZoom(); this.updateStatus(); this.gestures?.refresh();
  }
  setZoom(value) {
    this.autoFit = false;
    this.zoom = Math.max(0.1, Math.min(2, value));
    this.applyZoom(); this.updateStatus(); this.gestures.refresh();
  }
  togglePanel(panel) {
    if (this.root.clientWidth <= 720) {
      const name = 'sk-open-' + panel;
      const open = !this.root.classList.contains(name);
      this.root.classList.remove('sk-open-thumbnails', 'sk-open-inspector');
      this.root.classList.toggle(name, open);
      return;
    }
    this.root.classList.toggle(panel === 'thumbnails' ? 'sk-hide-thumbnails' : 'sk-hide-inspector');
  }
  listen() {
    const signal = this.abort.signal;
    this.root.addEventListener('focusout', () => {
      if (this.localePending) queueMicrotask(() => this.refreshLocale());
    }, { signal });
    this.root.addEventListener('pointerdown', event => this.run(() => {
      if (this.viewport.contains(event.target)) {
        const target = event.target.closest?.('[data-element-id]');
        if (target?.dataset.elementId !== this.text.id && !this.gestures.moveable.isMoveableElement(event.target)) this.text.stop();
        if (!this.text.id) this.root.focus({ preventScroll: true });
      }
    }), { signal });
    this.canvas.addEventListener('dblclick', event => {
      const node = event.target.closest('[data-element-id]');
      if (node) this.run(() => this.text.start(node.dataset.elementId));
    }, { signal });
    this.root.addEventListener('keydown', event => this.keydown(event), { capture: true, signal });
    document.addEventListener('pointerdown', event => this.run(() => {
      if (!this.root.contains(event.target)) {
        this.text.stop();
        this.root.querySelectorAll('details[open]').forEach(details => { details.open = false; });
      }
    }), { signal });
    this.root.addEventListener('copy', event => {
      if (this.text.id || event.target.closest('input,textarea') || !this.store.selected.length) return;
      clipboard = this.store.copySelection();
      event.clipboardData.setData('application/x-slidekit-elements', JSON.stringify(clipboard));
      event.clipboardData.setData('text/plain', '[SlideKit elements]');
      event.preventDefault();
    }, { signal });
    this.root.addEventListener('cut', event => {
      if (this.text.id || event.target.closest('input,textarea') || this.store.mode !== 'edit' || !this.store.selected.length) return;
      clipboard = this.store.copySelection();
      event.clipboardData.setData('application/x-slidekit-elements', JSON.stringify(clipboard));
      event.clipboardData.setData('text/plain', '[SlideKit elements]');
      event.preventDefault();
      this.run(() => this.store.deleteElements());
    }, { signal });
    this.root.addEventListener('paste', event => {
      if (this.text.id || event.target.closest('input,textarea') || this.store.mode !== 'edit') return;
      const serialized = event.clipboardData.getData('application/x-slidekit-elements');
      const image = [...event.clipboardData.files].find(file => file.type.startsWith('image/'));
      if (serialized) {
        event.preventDefault(); this.run(() => this.store.pasteSelection(JSON.parse(serialized)));
      } else if (image) { event.preventDefault(); this.run(() => this.addImage(image)); }
      else if (clipboard && event.clipboardData.getData('text/plain') === '[SlideKit elements]') {
        event.preventDefault(); this.run(() => this.store.pasteSelection(clipboard));
      }
    }, { signal });
    this.viewport.addEventListener('dragover', event => {
      if (event.dataTransfer.types.includes('Files') && this.store.mode === 'edit') event.preventDefault();
    }, { signal });
    this.viewport.addEventListener('drop', event => {
      if (this.store.mode !== 'edit') return;
      const file = [...event.dataTransfer.files].find(file => file.type.startsWith('image/'));
      if (file) { event.preventDefault(); this.run(() => this.addImage(file)); }
    }, { signal });
    document.addEventListener('fullscreenchange', () => {
      if (this.presentation && this.wasFullscreen && document.fullscreenElement !== this.presentation) this.exitPresent();
      this.wasFullscreen = document.fullscreenElement === this.presentation;
    }, { signal });
  }
  keydown(event) {
    if (this.documentImport) {
      if (event.key === 'Escape') { event.preventDefault(); this.documentImport.abort(); }
      return;
    }
    if (this.presentation) {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); this.presentationStep(1); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); this.presentationStep(-1); }
      if (event.key === 'Escape') { event.preventDefault(); this.exitPresent(); }
      return;
    }
    if (event.isComposing || this.text.composing || event.target.closest('input,textarea,select')) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (event.key === 'Escape') {
      this.run(() => { this.text.stop(); this.store.selectElements([]); this.root.focus(); }); return;
    }
    if (mod && key === 's') {
      event.preventDefault(); this.run(() => this.downloadJSON()); return;
    }
    if (this.store.mode !== 'edit') return;
    if (mod && (key === 'z' || key === 'y')) {
      event.preventDefault(); event.stopPropagation();
      this.run(() => key === 'y' || event.shiftKey ? this.redo() : this.undo()); return;
    }
    if (this.text.id) return;
    if (mod && key === 'a') { event.preventDefault(); this.store.selectElements(this.store.slide.elements.filter(element => !element.locked).map(element => element.id)); }
    else if (mod && key === 'd') { event.preventDefault(); this.run(() => this.store.pasteSelection(this.store.copySelection())); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.run(() => this.store.deleteElements()); }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && this.store.selected.length) {
      event.preventDefault();
      const distance = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0;
      const dy = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0;
      this.run(() => this.store.updateElements(this.store.elements.filter(element => !element.locked).map(element => ({ id: element.id, patch: { x: element.x + dx, y: element.y + dy } })), 'nudge'));
    } else if (event.key === 'Enter' && this.store.selected.length === 1) {
      event.preventDefault(); this.run(() => this.text.start(this.store.selected[0]));
    }
  }
  getDocument() {
    const doc = this.store.getDocument();
    if (this.text.id) {
      const element = doc.slides.find(slide => slide.id === this.store.slideId)?.elements.find(item => item.id === this.text.id);
      if (element) element.content = this.text.content();
    }
    return doc;
  }
  setDocument(doc) {
    const valid = validateDocument(doc);
    this.documentImport?.abort();
    this.text.stop(); this.exitPresent();
    this.showImportWarnings([]);
    this.store.setDocument(valid); this.fit();
  }
  goToSlide(id) { this.text.stop(); this.store.goToSlide(id); }
  addSlide(properties, index) { this.text.stop(); return this.store.addSlide(properties, index); }
  insertText() {
    this.store.assertEditable(); this.text.stop();
    const id = this.store.addElement('text');
    this.text.start(id);
    this.text.editor.commands.selectAll();
  }
  insertShape(shape) {
    this.run(() => {
      this.text.stop();
      const props = ['line', 'arrow'].includes(shape) ? { shape, width: 320, height: 30, strokeWidth: 3 } : { shape };
      this.store.addElement('shape', props);
    });
  }
  async addImage(file, properties = {}) {
    this.store.assertEditable(); this.text.stop();
    const slideId = this.store.slideId;
    const loadVersion = this.store.loadVersion;
    const asset = await readImage(file);
    if (!file.name) asset.name = this.t('图片');
    this.store.assertEditable();
    if (this.store.loadVersion !== loadVersion) throw new Error('文稿已重新加载，请重新插入图片');
    if (this.store.slideId !== slideId) throw new Error('页面已切换，请在目标页面重新插入图片');
    return this.store.addImageAsset(asset, properties);
  }
  openImage() {
    const input = dom('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
    input.addEventListener('change', () => { if (input.files[0]) this.run(() => this.addImage(input.files[0])); }, { once: true });
    input.click();
  }
  openDocument() {
    const input = dom('input'); input.type = 'file'; input.accept = '.json,.pdf,.pptx,application/json,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation';
    input.addEventListener('change', () => this.run(async () => {
      const file = input.files[0]; if (!file) return;
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        try { await this.importPdf(file); this.notify('PDF 已打开，可添加文字和形状'); }
        catch (error) { if (error.name === 'AbortError') this.notify('已取消 PDF 导入'); else throw error; }
        return;
      }
      if (/\.ppt$/i.test(file.name)) throw new Error('暂不支持旧版 .ppt，请在 PowerPoint/WPS 中另存为 .pptx');
      if (/\.pptx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        try { await this.importPptx(file); this.notify('PPTX 已打开，可继续编辑'); }
        catch (error) { if (error.name === 'AbortError') this.notify('已取消 PPTX 导入'); else throw error; }
        return;
      }
      try {
        await this.importDocument('JSON', undefined, async () => ({
          document: validateDocument(JSON.parse(await file.text())), warnings: [],
        }));
        this.notify('文稿已打开');
      } catch (error) { if (error.name === 'AbortError') this.notify('已取消 JSON 导入'); else throw error; }
    }), { once: true });
    input.click();
  }
  async importPdf(file, { password, signal, limits } = {}) {
    const importLimits = resolvePdfLimits(this.pdfLimits, limits);
    await this.importDocument('PDF', signal, async (controller, dialog) => ({
      document: await readPdf(file, {
        password, signal: controller.signal, assetsUrl: this.options.pdfAssetsUrl, limits: importLimits,
        t: (...args) => this.t(...args),
        onProgress: progress => dialog.progress(progress), onPassword: incorrect => dialog.password(incorrect),
      }), warnings: [],
    }));
  }
  async importPptx(file, { signal } = {}) {
    return this.importDocument('PPTX', signal, (controller, dialog) => readPptx(file, {
      signal: controller.signal, onProgress: progress => dialog.progress(progress),
      t: (...args) => this.t(...args),
    }));
  }
  async importDocument(format, signal, read) {
    if (this.documentImport) throw new Error('文稿正在导入，请先完成或取消');
    signal?.throwIfAborted();
    this.text.flush({ throwOnError: true });
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.abort.signal.addEventListener('abort', abort, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    const initialDocument = this.store.doc;
    this.documentImport = controller;
    const dialog = createImportDialog(this.root, controller, format, (...args) => this.t(...args));
    this.importDialog = dialog;
    try {
      const result = await read(controller, dialog);
      controller.signal.throwIfAborted();
      if (this.store.doc !== initialDocument) throw new Error('文稿在导入期间已修改，请重新打开文件');
      this.text.stop(); this.exitPresent();
      this.store.setDocument(result.document); this.fit();
      this.showImportWarnings(result.warnings);
      return { warnings: result.warnings.map(message => this.message(message)) };
    } finally {
      this.abort.signal.removeEventListener('abort', abort);
      signal?.removeEventListener('abort', abort);
      dialog.destroy();
      this.documentImport = null;
      this.importDialog = null;
      if (this.localePending) this.refreshLocale();
    }
  }
  showImportWarnings(warnings) {
    this.importWarnings = [...warnings];
    const open = this.importNotice?.open || false;
    this.importNotice?.remove(); this.importNotice = null;
    if (!warnings.length) return;
    const notice = dom('details', 'sk-import-notice');
    const summary = dom('summary', '', this.t('已打开 PPTX · {count} 项兼容性说明', { count: warnings.length }));
    const list = dom('ul');
    warnings.forEach(message => list.append(dom('li', '', this.message(message))));
    notice.open = open;
    notice.append(summary, list);
    this.root.insertBefore(notice, this.main);
    this.importNotice = notice;
  }
  align(alignment) {
    this.run(() => { this.text.stop(); const changes = alignElements(this.store.elements, alignment, this.store.doc); if (changes.length) this.store.updateElements(changes); });
  }
  distribute(axis) {
    this.run(() => { this.text.stop(); const changes = distributeElements(this.store.elements, axis); if (changes.length) this.store.updateElements(changes); });
  }
  undo() {
    if (!this.text.flush()) { this.text.restore(); return; }
    this.store.undo();
  }
  redo() { if (this.text.flush()) this.store.redo(); }
  downloadJSON() {
    download(new Blob([JSON.stringify(this.getDocument(), null, 2)], { type: 'application/json' }), this.store.doc.title + '.json');
  }
  async exportPptx() { return exportPptx(this.getDocument()); }
  async downloadPptx() {
    if (this.exporting) return;
    this.exporting = true;
    const title = this.store.doc.title;
    this.notify('正在生成 PowerPoint…');
    try {
      const blob = await this.exportPptx();
      if (!this.destroyed) { download(blob, title + '.pptx'); this.notify('PowerPoint 已导出'); }
    } catch (error) { this.report(error); }
    finally { this.exporting = false; }
  }
  async present() {
    if (this.presentation) return;
    this.text.stop();
    const slides = this.store.doc.slides.filter(slide => !slide.hidden);
    if (!slides.length) { this.notify('所有页面均已隐藏，请先取消至少一页的隐藏'); return; }
    this.presentationDocument = this.store.doc;
    this.presentationIndex = Math.max(0, slides.findIndex(slide => slide.id === this.store.slideId));
    this.presentation = dom('div', 'sk-presentation');
    this.presentation.tabIndex = 0;
    this.presentation.setAttribute('role', 'dialog');
    this.presentation.setAttribute('aria-label', this.t('幻灯片放映'));
    this.root.classList.add('sk-presenting');
    this.root.append(this.presentation);
    this.renderPresentation();
    this.presentation.focus();
    try { await this.presentation.requestFullscreen?.(); } catch { /* The in-page player remains usable when fullscreen is unavailable. */ }
    if (this.presentation) this.renderPresentation();
  }
  presentationStep(direction) {
    const count = this.presentationDocument.slides.filter(slide => !slide.hidden).length;
    this.presentationIndex = Math.max(0, Math.min(count - 1, this.presentationIndex + direction));
    this.renderPresentation();
  }
  renderPresentation() {
    if (!this.presentation) return;
    this.presentation.setAttribute('aria-label', this.t('幻灯片放映'));
    const doc = this.presentationDocument;
    const slides = doc.slides.filter(slide => !slide.hidden);
    const restoreFocus = this.presentation.contains(document.activeElement);
    const width = this.presentation.clientWidth, height = this.presentation.clientHeight;
    const scale = Math.min(width / doc.width, (height - 60) / doc.height);
    const frame = dom('div', 'sk-presentation-frame');
    frame.style.width = doc.width * scale + 'px'; frame.style.height = doc.height * scale + 'px';
    const slide = renderSlide(slides[this.presentationIndex], doc);
    slide.style.transform = 'scale(' + scale + ')';
    frame.append(slide);
    frame.addEventListener('click', () => this.presentationStep(1));
    const controls = dom('div', 'sk-presentation-controls');
    controls.append(button(this.t('上一页'), 'previous', () => this.presentationStep(-1), 'sk-icon-only'),
      dom('span', '', (this.presentationIndex + 1) + ' / ' + slides.length),
      button(this.t('下一页'), 'next', () => this.presentationStep(1), 'sk-icon-only'),
      button(this.t('退出放映'), 'close', () => this.exitPresent()));
    this.presentation.replaceChildren(frame, controls);
    if (restoreFocus) this.presentation.focus({ preventScroll: true });
  }
  exitPresent() {
    if (!this.presentation) return;
    const overlay = this.presentation;
    this.presentation = null;
    this.presentationDocument = null;
    this.wasFullscreen = false;
    if (document.fullscreenElement === overlay) document.exitFullscreen().catch(() => {});
    overlay.remove();
    this.root.classList.remove('sk-presenting');
    this.root.focus({ preventScroll: true });
  }
  destroy() {
    if (this.destroyed) return;
    this.exitPresent();
    this.text.flush();
    this.text.stop({ discard: true });
    this.destroyed = true;
    this.abort.abort();
    this.observer.disconnect();
    this.gestures.destroy();
    clearTimeout(this.toastTimer);
    cancelAnimationFrame(this.thumbnailFrame);
    this.store.destroy();
    this.root.remove();
  }
}
