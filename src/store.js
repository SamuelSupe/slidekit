import { clone, cloneAsset, cloneDocument, createDocument, createElement, emptySlide, paragraph, uid, validateDocument, validateDocumentInPlace } from './document.js';
import { History } from './history.js';
import { createTranslator, translateMessage } from './i18n.js';

function removeUnusedAssets(doc) {
  const used = new Set(doc.slides.flatMap(slide => slide.elements.filter(element => element.type === 'image').map(element => element.assetId)));
  for (const id of Object.keys(doc.assets)) if (!used.has(id)) delete doc.assets[id];
  return doc;
}

export class DocumentStore {
  constructor(doc, mode = 'edit', t = createTranslator()) {
    if (!['edit', 'view'].includes(mode)) throw new Error('模式必须是 edit 或 view');
    this.t = t;
    if (doc === undefined) {
      doc = createDocument(t('未命名演示文稿'));
      doc.slides[0].name = t('幻灯片 {number}', { number: 1 });
    }
    this.doc = removeUnusedAssets(validateDocument(doc));
    this.mode = mode;
    this.slideId = this.doc.slides[0].id;
    this.selected = [];
    this.history = new History();
    this.listeners = new Map();
    this.destroyed = false;
    this.loadVersion = 0;
  }
  get slide() { return this.doc.slides.find(slide => slide.id === this.slideId); }
  get elements() { return this.slide.elements.filter(element => this.selected.includes(element.id)); }
  on(event, listener) {
    if (typeof listener !== 'function') throw new TypeError('事件处理器必须是函数');
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }
  emit(event, payload) {
    const failed = error => {
      if (event === 'error') { console.error('SlideKit error handler failed', error); return; }
      this.emit('error', { error, message: translateMessage(error?.message || String(error), this.t), sourceEvent: event });
    };
    // A host callback must not interrupt a committed edit or later subscribers.
    for (const listener of [...(this.listeners.get(event) || [])]) {
      try {
        const result = listener(payload);
        if (result?.then) Promise.resolve(result).catch(failed);
      } catch (error) { failed(error); }
    }
  }
  assertEditable() {
    if (this.destroyed) throw new Error('编辑器已销毁');
    if (this.mode !== 'edit') throw new Error('只读模式不能修改文稿');
  }
  snapshot() { return { doc: this.doc, slideId: this.slideId, selected: [...this.selected] }; }
  getDocument() { return cloneDocument(this.doc); }
  normalizeSelection() {
    if (!this.doc.slides.some(slide => slide.id === this.slideId)) this.slideId = this.doc.slides[0].id;
    this.selected = this.selected.filter(id => this.slide.elements.some(element => element.id === id));
  }
  changed(reason) {
    this.normalizeSelection();
    this.emit('change', { reason });
    this.emit('selectionChange', { ids: [...this.selected] });
    this.emit('slideChange', { id: this.slideId, index: this.doc.slides.findIndex(slide => slide.id === this.slideId) });
  }
  setDocument(doc) {
    const next = removeUnusedAssets(validateDocument(doc));
    if (this.destroyed) throw new Error('编辑器已销毁');
    this.doc = next;
    this.loadVersion += 1;
    this.slideId = next.slides[0].id;
    this.selected = [];
    this.history.clear();
    this.changed('load');
  }
  commit(update, reason, group = null, after = null) {
    this.assertEditable();
    const before = this.snapshot();
    const next = cloneDocument(this.doc);
    update(next);
    // Prune only the new owned document. History snapshots still own the assets
    // required to undo deletion or replacement of the last referencing image.
    const validated = removeUnusedAssets(validateDocumentInPlace(next));
    this.history.record(before, group);
    this.doc = validated;
    after?.();
    this.changed(reason);
  }
  selectElements(ids) {
    this.selected = [...new Set(ids)].filter(id => this.slide.elements.some(element => element.id === id));
    this.emit('selectionChange', { ids: [...this.selected] });
  }
  goToSlide(id) {
    if (!this.doc.slides.some(slide => slide.id === id)) throw new Error('页面不存在');
    this.slideId = id;
    this.selected = [];
    this.history.group = null;
    this.emit('slideChange', { id, index: this.doc.slides.findIndex(slide => slide.id === id) });
    this.emit('selectionChange', { ids: [] });
  }
  setMode(mode) {
    if (!['edit', 'view'].includes(mode)) throw new Error('模式必须是 edit 或 view');
    this.mode = mode;
    this.selectElements([]);
    this.emit('modeChange', { mode });
  }
  updateDocument(patch) {
    this.commit(doc => Object.assign(doc, clone(patch)), 'document');
  }
  addSlide(properties = {}, index = this.doc.slides.findIndex(slide => slide.id === this.slideId) + 1) {
    const slide = { ...emptySlide(this.t('新幻灯片')), ...clone(properties), id: uid(), elements: [] };
    this.commit(doc => doc.slides.splice(Math.max(0, Math.min(doc.slides.length, index)), 0, slide), 'add-slide', null, () => {
      this.slideId = slide.id; this.selected = [];
    });
    return slide.id;
  }
  duplicateSlide(id = this.slideId) {
    const index = this.doc.slides.findIndex(slide => slide.id === id);
    if (index < 0) throw new Error('页面不存在');
    const slide = clone(this.doc.slides[index]);
    slide.id = uid();
    slide.name = this.t('{name} 副本', { name: slide.name });
    slide.elements.forEach(element => { element.id = uid(); });
    this.commit(doc => doc.slides.splice(index + 1, 0, slide), 'duplicate-slide', null, () => {
      this.slideId = slide.id; this.selected = [];
    });
    return slide.id;
  }
  updateSlide(id, patch) {
    if (!this.doc.slides.some(slide => slide.id === id)) throw new Error('页面不存在');
    this.commit(doc => {
      const slide = doc.slides.find(slide => slide.id === id);
      if (patch.name !== undefined) slide.name = patch.name;
      if (patch.background !== undefined) slide.background = patch.background;
      if (patch.backgroundGradient !== undefined) slide.backgroundGradient = clone(patch.backgroundGradient);
      if (patch.hidden !== undefined) slide.hidden = patch.hidden;
    }, 'update-slide');
  }
  deleteSlide(id = this.slideId) {
    const index = this.doc.slides.findIndex(slide => slide.id === id);
    if (index < 0) throw new Error('页面不存在');
    this.commit(doc => {
      doc.slides.splice(index, 1);
      if (!doc.slides.length) doc.slides.push(emptySlide(this.t('幻灯片 {number}', { number: 1 })));
    }, 'delete-slide', null, () => {
      if (this.slideId === id) this.slideId = this.doc.slides[Math.min(index, this.doc.slides.length - 1)].id;
    });
  }
  moveSlide(id, index) {
    const from = this.doc.slides.findIndex(slide => slide.id === id);
    if (from < 0 || !Number.isInteger(index) || index < 0 || index >= this.doc.slides.length) throw new Error('页面位置无效');
    this.commit(doc => doc.slides.splice(index, 0, doc.slides.splice(from, 1)[0]), 'move-slide');
  }
  addElement(type, properties = {}) {
    const element = createElement(type, type === 'text' ? { content: paragraph(this.t('双击编辑文字')), ...properties } : properties);
    this.commit(doc => doc.slides.find(slide => slide.id === this.slideId).elements.push(element), 'add-element', null, () => {
      this.selected = [element.id];
    });
    return element.id;
  }
  addImageAsset(asset, properties = {}) {
    const assetId = uid();
    const maxWidth = this.doc.width * 0.65;
    const maxHeight = this.doc.height * 0.65;
    const scale = Math.min(1, maxWidth / asset.width, maxHeight / asset.height);
    const width = asset.width * scale, height = asset.height * scale;
    const element = createElement('image', {
      width, height, x: (this.doc.width - width) / 2, y: (this.doc.height - height) / 2,
      ...properties, assetId,
    });
    this.commit(doc => {
      doc.assets[assetId] = cloneAsset(asset);
      doc.slides.find(slide => slide.id === this.slideId).elements.push(element);
    }, 'add-image', null, () => { this.selected = [element.id]; });
    return element.id;
  }
  updateElement(id, patch, group = null) {
    this.updateElements([{ id, patch }], group);
  }
  updateElements(updates, group = null) {
    const ids = updates.map(update => update.id);
    if (ids.some(id => !this.slide.elements.some(element => element.id === id))) throw new Error('元素不存在');
    this.commit(doc => {
      const elements = doc.slides.find(slide => slide.id === this.slideId).elements;
      for (const { id, patch } of updates) {
        const element = elements.find(item => item.id === id);
        if (element.locked && Object.keys(patch).some(key => key !== 'locked')) continue;
        const identity = { id: element.id, type: element.type };
        Object.assign(element, clone(patch), identity);
      }
    }, 'update-elements', group);
  }
  deleteElements(ids = this.selected) {
    const removable = this.slide.elements.filter(element => ids.includes(element.id) && !element.locked).map(element => element.id);
    if (!removable.length) return;
    this.commit(doc => {
      const slide = doc.slides.find(slide => slide.id === this.slideId);
      slide.elements = slide.elements.filter(element => !removable.includes(element.id));
    }, 'delete-elements');
  }
  reorderElement(id, direction) {
    const element = this.slide.elements.find(item => item.id === id);
    if (!element || element.locked) return;
    this.commit(doc => {
      const elements = doc.slides.find(slide => slide.id === this.slideId).elements;
      const index = elements.findIndex(item => item.id === id);
      const target = direction === 'front' ? elements.length - 1 : direction === 'back' ? 0 : Math.max(0, Math.min(elements.length - 1, index + direction));
      elements.splice(target, 0, elements.splice(index, 1)[0]);
    }, 'layer');
  }
  copySelection() {
    const elements = clone(this.elements);
    const assets = {};
    for (const element of elements) {
      if (element.type === 'image' && !Object.hasOwn(assets, element.assetId)) assets[element.assetId] = cloneAsset(this.doc.assets[element.assetId]);
    }
    return { elements, assets };
  }
  pasteSelection(clipboard) {
    if (!clipboard?.elements?.length) return [];
    const elements = clone(clipboard.elements);
    const assets = {};
    const remap = new Map();
    for (const element of elements) {
      element.id = uid(); element.x += 24; element.y += 24; element.locked = false;
      if (element.type === 'image') {
        if (!remap.has(element.assetId)) {
          const next = uid();
          remap.set(element.assetId, next);
          assets[next] = cloneAsset(clipboard.assets[element.assetId]);
        }
        element.assetId = remap.get(element.assetId);
      }
    }
    const ids = elements.map(element => element.id);
    this.commit(doc => {
      Object.assign(doc.assets, assets);
      doc.slides.find(slide => slide.id === this.slideId).elements.push(...elements);
    }, 'paste', null, () => { this.selected = ids; });
    return ids;
  }
  restore(snapshot, reason) {
    if (!snapshot) return;
    this.doc = snapshot.doc;
    this.slideId = snapshot.slideId;
    this.selected = snapshot.selected;
    this.changed(reason);
  }
  undo() { this.assertEditable(); this.restore(this.history.undo(this.snapshot()), 'undo'); }
  redo() { this.assertEditable(); this.restore(this.history.redo(this.snapshot()), 'redo'); }
  destroy() {
    this.listeners.clear();
    this.history.clear();
    this.destroyed = true;
  }
}
