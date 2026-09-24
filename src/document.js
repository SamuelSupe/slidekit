/** @import { Deck, SlideElement, TextNode } from './types.js' */

export const PAGE_SIZES = { wide: [1280, 720], standard: [960, 720] };
export const MAX_SLIDES = 500;
export const BLOCK_ARROWS = ['rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'upDownArrow'];
export const ARROW_ENDS = ['none', 'triangle', 'stealth', 'arrow', 'diamond', 'oval'];
export const SHAPES = ['rect', 'roundRect', 'ellipse', 'line', 'arrow', ...BLOCK_ARROWS];
export const DEFAULT_FONT = 'Arial';
const COLOR = /^#[\da-f]{6}$/i;
const FONT = /^[\p{L}\p{N} ,._-]{1,100}$/u;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  // getRandomValues also works in hosts served over ordinary HTTP.
  return [...crypto.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2, '0')).join('');
};
export const clone = value => structuredClone(value);
export const isColor = value => typeof value === 'string' && COLOR.test(value);
export const isFontFamily = value => typeof value === 'string' && FONT.test(value);

/** Own every mutable field while sharing immutable image strings across history snapshots. */
export function cloneDocument(input) {
  const { assets, ...rest } = input;
  const doc = clone(rest);
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) {
    doc.assets = clone(assets);
    return doc;
  }
  doc.assets = Object.fromEntries(Object.entries(assets).map(([id, asset]) => {
    if (!asset || typeof asset.data !== 'string') return [id, clone(asset)];
    const { data, ...metadata } = asset;
    return [id, { ...clone(metadata), data }];
  }));
  return doc;
}

function check(condition, message) {
  if (!condition) throw new TypeError(message);
}

function number(value, label, min = -100000, max = 100000) {
  check(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, label + '无效');
  return value;
}

/** Normalizes the supported paint model before it can reach CSS, SVG or OOXML. */
export function validateGradient(input) {
  check(input && input.type === 'linear', '仅支持线性渐变');
  const angle = number(input.angle, '渐变角度', -360, 360);
  check(typeof input.scaled === 'boolean' && typeof input.rotateWithShape === 'boolean', '渐变方向属性无效');
  check(Array.isArray(input.stops) && input.stops.length >= 2 && input.stops.length <= 32, '渐变须包含 2–32 个色标');
  const stops = input.stops.map(stop => {
    check(stop && isColor(stop.color), '渐变颜色无效');
    return { offset: number(stop.offset, '色标位置', 0, 1), color: stop.color, opacity: number(stop.opacity, '色标不透明度', 0, 1) };
  }).sort((a, b) => a.offset - b.offset);
  return { type: 'linear', angle, scaled: input.scaled, rotateWithShape: input.rotateWithShape, stops };
}

function validateShadow(shadow) {
  check(shadow && isColor(shadow.color) && typeof shadow.rotateWithShape === 'boolean', '阴影属性无效');
  return {
    color: shadow.color, opacity: number(shadow.opacity, '阴影不透明度', 0, 1),
    blur: number(shadow.blur, '阴影模糊', 0, 1000),
    offsetX: number(shadow.offsetX, '阴影水平偏移', -10000, 10000),
    offsetY: number(shadow.offsetY, '阴影垂直偏移', -10000, 10000),
    rotateWithShape: shadow.rotateWithShape,
  };
}

/** @returns {TextNode} */
export function paragraph(text = '') {
  return { type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] };
}

export function emptySlide(name = '新幻灯片') {
  return { id: uid(), name, background: '#ffffff', elements: [] };
}

/** @returns {Deck} */
export function createDocument(title = '未命名演示文稿') {
  return { schemaVersion: 1, title, width: 1280, height: 720, slides: [emptySlide('幻灯片 1')], assets: {} };
}

/**
 * Creates an element in logical pixels. Font sizes are in points.
 * @param {SlideElement['type']} [type]
 * @param {Partial<SlideElement>} [properties]
 * @returns {SlideElement}
 */
export function createElement(type = 'text', properties = {}) {
  const base = { id: uid(), type, x: 120, y: 120, width: 380, height: 100, rotation: 0, opacity: 1, locked: false };
  if (type === 'text') Object.assign(base, { content: paragraph('双击编辑文字'), fontFamily: DEFAULT_FONT, fontSize: 28, color: '#202a3a', lineHeight: 1.3 });
  if (type === 'shape') Object.assign(base, { shape: 'rect', width: 260, height: 160, fill: '#5969d9', stroke: '#5969d9', strokeWidth: 0 });
  if (type === 'image') Object.assign(base, { width: 400, height: 300, fit: 'contain' });
  return { ...base, ...clone(properties), id: base.id, type };
}

/** Rejects unsupported markup before it reaches a DOM renderer or exporter. */
export function validateText(root) {
  let count = 0;
  function visit(node, parent, depth) {
    check(node && typeof node === 'object' && depth <= 12 && ++count <= 50000, '富文本结构无效');
    const allowed = {
      root: ['doc'], doc: ['paragraph', 'bulletList', 'orderedList'],
      paragraph: ['text', 'hardBreak'], bulletList: ['listItem'], orderedList: ['listItem'],
      listItem: ['paragraph', 'bulletList', 'orderedList'],
    };
    check(allowed[parent]?.includes(node.type), '不支持的富文本节点：' + node.type);
    const out = { type: node.type };
    if (node.type === 'text') {
      check(typeof node.text === 'string' && node.text.length > 0, '文字内容无效');
      out.text = node.text;
    }
    if (node.attrs) {
      const attrs = {};
      if (node.type === 'paragraph') {
        if (node.attrs.textAlign != null) {
          check(['left', 'center', 'right', 'justify'].includes(node.attrs.textAlign), '段落对齐无效');
          attrs.textAlign = node.attrs.textAlign;
        }
        if (node.attrs.lineHeight != null) {
          const value = Number(node.attrs.lineHeight);
          number(value, '行距', 0.8, 3);
          attrs.lineHeight = String(value);
        }
      }
      if (node.type === 'orderedList' && node.attrs.start != null) {
        number(node.attrs.start, '列表起始序号', 1, 9999);
        check(Number.isInteger(node.attrs.start), '列表起始序号必须为整数');
        attrs.start = node.attrs.start;
      }
      if (Object.keys(attrs).length) out.attrs = attrs;
    }
    if (node.marks?.length) {
      check(node.type === 'text' || node.type === 'hardBreak', '富文本标记位置无效');
      out.marks = node.marks.map(mark => {
        check(['bold', 'italic', 'underline', 'textStyle'].includes(mark.type), '不支持的文字样式');
        if (mark.type !== 'textStyle') return { type: mark.type };
        const attrs = {};
        for (const [key, value] of Object.entries(mark.attrs || {})) {
          if (value == null) continue;
          if (key === 'gradient') attrs.gradient = validateGradient(value);
          else if (key === 'opacity') attrs.opacity = number(value, '局部文字不透明度', 0, 1);
          else if (key === 'color') { check(isColor(value), '文字颜色无效'); attrs.color = value; }
          else if (key === 'fontFamily') { check(isFontFamily(value), '字体名称无效'); attrs.fontFamily = value; }
          else if (key === 'fontSize') {
            check(/^\d+(\.\d+)?pt$/.test(value), '字号须为 pt 单位');
            number(parseFloat(value), '字号', 1, 256); attrs.fontSize = value;
          } else check(false, '不支持的文字属性：' + key);
        }
        return { type: 'textStyle', attrs };
      });
    }
    if (node.content !== undefined) {
      check(Array.isArray(node.content) && node.type !== 'text' && node.type !== 'hardBreak', '富文本子节点无效');
      out.content = node.content.map(child => visit(child, node.type, depth + 1));
    }
    if (['doc', 'listItem', 'bulletList', 'orderedList'].includes(node.type)) {
      check(out.content?.length > 0, '富文本容器不能为空');
    }
    if (node.type === 'listItem') check(out.content[0].type === 'paragraph', '列表项须以段落开始');
    return out;
  }
  return visit(root, 'root', 0);
}

/**
 * Validates and returns an owned normalized copy. Never mutates its input.
 * @param {unknown} input
 * @returns {Deck}
 */
export function validateDocument(input) {
  check(input && input.schemaVersion === 1, '不支持的文稿版本（需要 schemaVersion: 1）');
  const doc = cloneDocument(input);
  check(typeof doc.title === 'string' && doc.title.length <= 500, '文稿标题无效');
  number(doc.width, '页面宽度', 100, 10000);
  number(doc.height, '页面高度', 100, 10000);
  check(Array.isArray(doc.slides) && doc.slides.length > 0 && doc.slides.length <= MAX_SLIDES, '文稿须包含 1–' + MAX_SLIDES + ' 页');
  check(doc.assets && typeof doc.assets === 'object' && !Array.isArray(doc.assets), '图片资源表无效');
  const ids = new Set();
  function id(value) {
    check(typeof value === 'string' && value.length > 0 && value.length < 150 && !ids.has(value), '文稿 ID 缺失或重复');
    ids.add(value);
  }
  for (const [key, asset] of Object.entries(doc.assets)) {
    check(key !== '__proto__' && key !== 'constructor' && key !== 'prototype', '图片 ID 无效');
    check(asset && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\r\n]+$/.test(asset.data), '图片必须是内嵌的 PNG/JPEG');
    number(asset.width, '图片宽度', 1, 50000);
    number(asset.height, '图片高度', 1, 50000);
    check(typeof asset.name === 'string', '图片名称无效');
  }
  for (const slide of doc.slides) {
    id(slide.id);
    check(typeof slide.name === 'string' && isColor(slide.background), '页面属性无效');
    if (slide.hidden !== undefined) check(typeof slide.hidden === 'boolean', '页面隐藏状态无效');
    if (slide.backgroundGradient != null) slide.backgroundGradient = validateGradient(slide.backgroundGradient);
    check(Array.isArray(slide.elements) && slide.elements.length <= 2000, '页面元素数量无效');
    for (const element of slide.elements) {
      id(element.id);
      check(['text', 'shape', 'image'].includes(element.type), '不支持的元素类型');
      for (const key of ['x', 'y', 'rotation']) number(element[key], key);
      for (const key of ['width', 'height']) number(element[key], key, 1);
      number(element.opacity, '透明度', 0, 1);
      check(typeof element.locked === 'boolean', '锁定状态无效');
      if (element.shadow != null) element.shadow = validateShadow(element.shadow);
      if (element.gradient != null) {
        check(element.type === 'shape', '元素渐变填充仅适用于形状');
        element.gradient = validateGradient(element.gradient);
      }
      for (const key of ['arrowShaft', 'arrowHead']) {
        if (element[key] !== undefined) check(element.type === 'shape' && BLOCK_ARROWS.includes(element.shape), '箭头比例仅适用于块状箭头');
      }
      for (const key of ['startArrow', 'endArrow']) {
        if (element[key] !== undefined) check(element.type === 'shape' && ['line', 'arrow'].includes(element.shape) && ARROW_ENDS.includes(element[key]), '连线箭头端点无效');
      }
      if (element.points != null) {
        check(element.type === 'shape' && ['line', 'arrow'].includes(element.shape), '折线路径仅适用于连线');
        check(Array.isArray(element.points) && element.points.length >= 2 && element.points.length <= 32, '折线须包含 2–32 个路径点');
        element.points = element.points.map(point => ({ x: number(point?.x, '路径点 X'), y: number(point?.y, '路径点 Y') }));
        check(element.points.some(point => point.x !== element.points[0].x || point.y !== element.points[0].y), '折线路径不能全部重合');
      }
      if (element.type === 'text') {
        element.content = validateText(element.content);
        number(element.fontSize, '字号', 1, 256);
        number(element.lineHeight, '行距', 0.8, 3);
        check(isColor(element.color) && isFontFamily(element.fontFamily), '文字样式无效');
      }
      if (element.type === 'shape') {
        check(SHAPES.includes(element.shape), '不支持的形状');
        check((element.fill === 'transparent' || isColor(element.fill)) && isColor(element.stroke), '形状颜色无效');
        number(element.strokeWidth, '描边宽度', 0, 30);
        if (element.fillOpacity !== undefined) number(element.fillOpacity, '填充不透明度', 0, 1);
        if (element.strokeOpacity !== undefined) number(element.strokeOpacity, '描边不透明度', 0, 1);
        if (element.arrowShaft !== undefined) number(element.arrowShaft, '箭杆比例', 0, 1);
        if (element.arrowHead !== undefined) number(element.arrowHead, '箭头比例', 0, 100000);
      }
      if (element.type === 'image') {
        check(typeof element.assetId === 'string' && own(doc.assets, element.assetId), '图片资源不存在');
        check(['contain', 'cover'].includes(element.fit), '图片适配方式无效');
      }
    }
  }
  return doc;
}

export function plainText(content) {
  if (content.type === 'text') return content.text;
  if (content.type === 'hardBreak') return '\n';
  return (content.content || []).map(plainText).join(content.type === 'doc' ? '\n' : '');
}
