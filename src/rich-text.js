import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { clone, isColor, isFontFamily, validateGradient, validateText } from './document.js';
import { textGradientStyle } from './appearance.js';

const GradientText = Extension.create({
  name: 'gradientText',
  addGlobalAttributes() {
    return [{ types: ['textStyle'], attributes: { opacity: {
      default: null,
      parseHTML: element => element.style.opacity === '' ? null : Number(element.style.opacity),
      renderHTML: attributes => attributes.opacity == null ? {} : { style: 'opacity:' + attributes.opacity },
    }, gradient: {
      default: null,
      parseHTML: element => {
        try { return validateGradient(JSON.parse(element.getAttribute('data-sk-gradient'))); }
        catch { return null; }
      },
      renderHTML: attributes => attributes.gradient ? {
        'data-sk-gradient': JSON.stringify(attributes.gradient), style: textGradientStyle(attributes.gradient),
      } : {},
    } } }];
  },
});

const ParagraphSpacing = Extension.create({
  name: 'paragraphSpacing',
  addGlobalAttributes() {
    return [{
      types: ['paragraph'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: element => element.style.lineHeight || null,
          renderHTML: attributes => attributes.lineHeight ? { style: 'line-height: ' + attributes.lineHeight } : {},
        },
      },
    }];
  },
});

export function normalizeText(input) {
  const content = clone(input);
  let colorContext;
  function cssColor(value) {
    if (isColor(value)) return { color: value, opacity: 1 };
    if (typeof value !== 'string') return null;
    if (!colorContext) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      colorContext = canvas.getContext('2d', { willReadFrequently: true });
    }
    // Canvas resolves CSS colors without maintaining a second color parser.
    // Invalid assignments retain the previous fill, so two sentinels detect them.
    colorContext.fillStyle = '#000000'; colorContext.fillStyle = value;
    const color = colorContext.fillStyle;
    colorContext.fillStyle = '#ffffff'; colorContext.fillStyle = value;
    if (color !== colorContext.fillStyle) return null;
    if (isColor(color)) return { color, opacity: 1 };
    const rgb = /^rgba?\(([^)]+)\)$/.exec(color);
    let channels;
    if (rgb) channels = rgb[1].split(',').map(Number);
    else {
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillRect(0, 0, 1, 1);
      channels = [...colorContext.getImageData(0, 0, 1, 1).data];
      channels[3] /= 255;
    }
    return { color: '#' + channels.slice(0, 3).map(channel => Math.round(channel).toString(16).padStart(2, '0')).join(''), opacity: channels[3] ?? 1 };
  }
  function visit(node) {
    if (node.type === 'orderedList' && node.attrs?.start != null) {
      const start = Number(node.attrs.start);
      node.attrs.start = Number.isFinite(start) ? Math.max(1, Math.min(9999, Math.trunc(start))) : 1;
    }
    if (node.attrs?.lineHeight) {
      const height = Number(node.attrs.lineHeight);
      node.attrs.lineHeight = Number.isFinite(height) ? String(Math.max(0.8, Math.min(3, height))) : null;
    }
    for (const mark of node.marks || []) {
      if (mark.type !== 'textStyle') continue;
      const attrs = mark.attrs || {};
      if (attrs.fontSize != null) {
        const size = parseFloat(attrs.fontSize) * (String(attrs.fontSize).endsWith('px') ? 0.75 : 1);
        attrs.fontSize = Number.isFinite(size) ? Math.max(1, Math.min(256, size)) + 'pt' : null;
      }
      if (attrs.fontFamily != null) {
        const font = String(attrs.fontFamily).replace(/["']/g, '');
        attrs.fontFamily = isFontFamily(font) ? font : null;
      }
      if (attrs.color != null) {
        const paint = attrs.color ? cssColor(attrs.color) : null;
        attrs.color = paint?.color ?? null;
        if (paint && paint.opacity !== 1) attrs.opacity = (attrs.opacity ?? 1) * paint.opacity;
      }
    }
    for (const child of node.content || []) visit(child);
  }
  visit(content);
  return validateText(content);
}

export class RichTextSession {
  constructor(owner) {
    this.owner = owner;
    this.editor = null;
    this.id = null;
    this.composing = false;
    this.restoring = false;
    this.nextGroup = undefined;
  }
  start(id) {
    const element = this.owner.store.slide.elements.find(item => item.id === id);
    if (!element || element.type !== 'text' || element.locked || this.owner.store.mode !== 'edit') return;
    if (this.id === id) { this.editor.commands.focus(); return; }
    this.stop();
    this.owner.store.selectElements([id]);
    this.id = id;
    const node = this.owner.elementNode(id);
    node.replaceChildren();
    node.classList.add('sk-editing');
    this.editor = new Editor({
      element: node,
      content: element.content,
      injectCSS: false,
      extensions: [
        StarterKit.configure({
          undoRedo: false, heading: false, blockquote: false, code: false, codeBlock: false,
          horizontalRule: false, link: false, strike: false, trailingNode: false,
          dropcursor: false, gapcursor: false,
        }),
        TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
        TextAlign.configure({ types: ['paragraph'] }),
        ParagraphSpacing,
        GradientText,
      ],
      editorProps: {
        attributes: { class: 'sk-text-input', 'aria-label': '编辑幻灯片文字', spellcheck: 'false' },
        handleDOMEvents: {
          compositionstart: () => { this.composing = true; return false; },
          compositionend: () => {
            this.composing = false;
            clearTimeout(this.compositionTimer);
            this.compositionTimer = setTimeout(() => this.flush(), 0);
            return false;
          },
        },
      },
      onUpdate: () => {
        if (!this.composing && !this.restoring) this.flush();
      },
      onSelectionUpdate: () => this.owner.toolbar.updateText(),
    });
    this.editor.commands.focus('end');
    this.owner.gestures.refresh();
    this.owner.toolbar.updateText();
  }
  content() {
    return this.editor ? normalizeText(this.editor.getJSON()) : null;
  }
  flush({ throwOnError = false } = {}) {
    if (!this.editor || this.restoring || this.owner.store.mode !== 'edit') return true;
    const element = this.owner.store.slide.elements.find(item => item.id === this.id);
    if (!element) return true;
    try {
      const content = this.content();
      if (JSON.stringify(content) === JSON.stringify(element.content)) return true;
      const group = this.nextGroup === undefined ? 'text:' + this.id : this.nextGroup;
      this.nextGroup = undefined;
      this.owner.store.updateElement(this.id, { content }, group);
      return true;
    } catch (error) {
      if (throwOnError) throw error;
      this.owner.report(error);
      return false;
    }
  }
  stop({ discard = false } = {}) {
    if (!this.editor) return;
    // Failed validation must leave the editable draft available for recovery.
    // Only explicit instance destruction may discard an uncommitted draft.
    if (!discard) this.flush({ throwOnError: true });
    clearTimeout(this.compositionTimer);
    this.editor.destroy();
    const previous = this.id;
    this.editor = null;
    this.id = null;
    this.composing = false;
    this.owner.renderCanvas();
    this.owner.toolbar.updateText();
    this.owner.gestures?.refresh();
    return previous;
  }
  restore() {
    if (!this.editor) return;
    const element = this.owner.store.slide.elements.find(item => item.id === this.id);
    if (!element || element.locked) { this.stop(); return; }
    const { from, to } = this.editor.state.selection;
    this.restoring = true;
    this.editor.commands.setContent(element.content, { emitUpdate: false });
    const end = Math.max(0, this.editor.state.doc.content.size - 1);
    this.editor.commands.setTextSelection({ from: Math.min(from, end), to: Math.min(to, end) });
    this.restoring = false;
    this.owner.toolbar.updateText();
  }
  format(command, value) {
    if (!this.editor) {
      const element = this.owner.store.elements.find(item => item.type === 'text' && !item.locked);
      if (!element) return;
      this.start(element.id);
      this.editor.commands.selectAll();
    }
    this.nextGroup = null;
    const chain = this.editor.chain().focus();
    if (command === 'fontFamily') chain.setFontFamily(value).run();
    if (command === 'fontSize') chain.setFontSize(Number(value) + 'pt').run();
    if (command === 'color') chain.setMark('textStyle', { gradient: null }).setColor(value).run();
    if (command === 'bold') chain.toggleBold().run();
    if (command === 'italic') chain.toggleItalic().run();
    if (command === 'underline') chain.toggleUnderline().run();
    if (command === 'align') chain.setTextAlign(value).run();
    if (command === 'lineHeight') chain.updateAttributes('paragraph', { lineHeight: String(value) }).run();
    if (command === 'bulletList') chain.toggleBulletList().run();
    if (command === 'orderedList') chain.toggleOrderedList().run();
    this.owner.toolbar.updateText();
  }
}
