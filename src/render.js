export function dom(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function renderText(content) {
  if (content.type === 'text') {
    let node = document.createTextNode(content.text);
    for (const mark of content.marks || []) {
      const wrapper = dom({ bold: 'strong', italic: 'em', underline: 'u' }[mark.type] || 'span');
      if (mark.type === 'textStyle') {
        for (const key of ['fontFamily', 'fontSize', 'color']) {
          if (mark.attrs?.[key]) wrapper.style[key] = mark.attrs[key];
        }
        if (mark.attrs?.gradient) wrapper.style.cssText += textGradientStyle(mark.attrs.gradient);
        if (mark.attrs?.opacity !== undefined) wrapper.style.opacity = String(mark.attrs.opacity);
      }
      wrapper.append(node);
      node = wrapper;
    }
    return node;
  }
  const node = dom({ doc: 'div', paragraph: 'p', bulletList: 'ul', orderedList: 'ol', listItem: 'li', hardBreak: 'br' }[content.type] || 'span');
  if (content.attrs?.textAlign) node.style.textAlign = content.attrs.textAlign;
  if (content.attrs?.lineHeight) node.style.lineHeight = content.attrs.lineHeight;
  if (content.type === 'orderedList' && content.attrs?.start) node.start = content.attrs.start;
  for (const child of content.content || []) node.append(renderText(child));
  if (content.type === 'paragraph' && !content.content?.length) node.append(dom('br'));
  return node;
}

function svgNode(name, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function shapeNode(element) {
  const { width: w, height: h, shape, fill, stroke, strokeWidth } = element;
  const svg = svgNode('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', height: '100%', 'aria-hidden': 'true' });
  const strokeOpacity = element.strokeOpacity ?? 1;
  const attrs = { fill: fill === 'transparent' ? 'none' : fill, 'fill-opacity': element.fillOpacity ?? 1, stroke, 'stroke-width': strokeWidth, 'stroke-opacity': strokeOpacity };
  if (element.gradient) {
    const id = 'sk-gradient-' + uid();
    const direction = gradientVector(element.gradient, w, h, element.rotation);
    const length = Math.abs(direction.x) * w + Math.abs(direction.y) * h;
    const gradient = svgNode('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: (w - direction.x * length) / 2, y1: (h - direction.y * length) / 2, x2: (w + direction.x * length) / 2, y2: (h + direction.y * length) / 2 });
    for (const stop of element.gradient.stops) gradient.append(svgNode('stop', { offset: stop.offset, 'stop-color': stop.color, 'stop-opacity': stop.opacity }));
    const defs = svgNode('defs', {}); defs.append(gradient); svg.append(defs);
    attrs.fill = 'url(#' + id + ')';
  }
  const inset = strokeWidth / 2;
  if (shape === 'ellipse') svg.append(svgNode('ellipse', { cx: w / 2, cy: h / 2, rx: Math.max(0, w / 2 - inset), ry: Math.max(0, h / 2 - inset), ...attrs }));
  else if (shape === 'line' || shape === 'arrow') {
    const thickness = Math.max(strokeWidth, 1);
    const points = (element.points || [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }])
      .map(point => ({ x: point.x * w, y: point.y * h }))
      .filter((point, index, list) => !index || Math.hypot(point.x - list[index - 1].x, point.y - list[index - 1].y) > 1e-8);
    if (points.length < 2) return svg;
    const length = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
    const head = Math.min(length / 2, Math.max(12, thickness * 4));
    const start = element.startArrow || 'none', end = element.endArrow ?? (shape === 'arrow' ? 'triangle' : 'none');
    svg.style.overflow = 'visible';
    const shaft = points.map(point => ({ ...point }));
    const heads = [];
    for (const [type, index, adjacent] of [[start, 0, 1], [end, points.length - 1, points.length - 2]]) {
      if (type === 'none') continue;
      const tip = points[index], neighbor = points[adjacent];
      const angle = Math.atan2(tip.y - neighbor.y, tip.x - neighbor.x);
      if (type !== 'arrow') {
        const inset = Math.min(head * 0.7, Math.hypot(tip.x - neighbor.x, tip.y - neighbor.y));
        shaft[index].x -= Math.cos(angle) * inset;
        shaft[index].y -= Math.sin(angle) * inset;
      }
      heads.push({ type, tip, angle });
    }
    svg.append(svgNode('polyline', { points: shaft.map(point => point.x + ',' + point.y).join(' '), fill: 'none', stroke, 'stroke-width': thickness, 'stroke-opacity': strokeOpacity, 'stroke-linejoin': 'round' }));
    for (const { type, tip, angle } of heads) {
      const group = svgNode('g', { transform: 'translate(' + tip.x + ' ' + tip.y + ') rotate(' + angle * 180 / Math.PI + ')', 'fill-opacity': strokeOpacity, 'stroke-opacity': strokeOpacity });
      if (type === 'oval') group.append(svgNode('ellipse', { cx: -head / 2, cy: 0, rx: head / 2, ry: head / 2, fill: stroke }));
      else {
        const d = type === 'diamond' ? 'M 0 0 L ' + -head / 2 + ' ' + -head / 2 + ' L ' + -head + ' 0 L ' + -head / 2 + ' ' + head / 2 + ' Z'
          : 'M ' + -head + ' ' + -head / 2 + ' L 0 0 L ' + -head + ' ' + head / 2 + (type === 'arrow' ? '' : type === 'stealth' ? ' L ' + -head * 0.65 + ' 0 Z' : ' Z');
        group.append(svgNode('path', { d, fill: type === 'arrow' ? 'none' : stroke, stroke, 'stroke-width': type === 'arrow' ? thickness : 0, 'stroke-linejoin': 'round' }));
      }
      svg.append(group);
    }
  } else if (BLOCK_ARROWS.includes(shape)) svg.append(svgNode('polygon', { points: blockArrowPoints(element).map(point => point.join(',')).join(' '), ...attrs, 'stroke-linejoin': 'round' }));
  else svg.append(svgNode('rect', { x: inset, y: inset, width: Math.max(0, w - strokeWidth), height: Math.max(0, h - strokeWidth), rx: shape === 'roundRect' ? Math.min(w, h) * 0.12 : 0, ...attrs }));
  return svg;
}

export function positionElement(node, element) {
  Object.assign(node.style, {
    left: '0', top: '0',
    width: element.width + 'px', height: element.height + 'px',
    transform: 'translate(' + element.x + 'px, ' + element.y + 'px) rotate(' + element.rotation + 'deg)', opacity: String(element.opacity),
    filter: element.shadow ? shadowCss(element.shadow, element.rotation) : '',
  });
}

export function renderElement(element, assets) {
  const node = dom('div', 'sk-element sk-' + element.type);
  node.dataset.elementId = element.id;
  node.dataset.locked = String(element.locked);
  positionElement(node, element);
  if (['line', 'arrow'].includes(element.shape)) node.style.overflow = 'visible';
  if (element.type === 'text') {
    Object.assign(node.style, { fontFamily: element.fontFamily, fontSize: element.fontSize + 'pt', color: element.color, lineHeight: String(element.lineHeight) });
    node.append(renderText(element.content));
  } else if (element.type === 'image') {
    const image = dom('img');
    image.src = assets[element.assetId].data;
    image.alt = assets[element.assetId].name;
    image.draggable = false;
    image.style.objectFit = element.fit;
    node.append(image);
  } else node.append(shapeNode(element));
  return node;
}

export function renderSlide(slide, deck, className = '') {
  const node = dom('div', 'sk-slide ' + className);
  node.style.width = deck.width + 'px';
  node.style.height = deck.height + 'px';
  paintBackground(node, slide, deck);
  for (const element of slide.elements) node.append(renderElement(element, deck.assets));
  return node;
}

export function paintBackground(node, slide, deck) {
  node.style.background = slide.backgroundGradient ? gradientCss(slide.backgroundGradient, deck.width, deck.height) : slide.background;
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = dom('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readImage(file) {
  if (!(file instanceof Blob) || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('请选择 PNG、JPEG 或 WebP 图片');
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000) throw new Error('图片不能超过 4000 万像素');
    let normalized = file;
    if (file.type === 'image/webp') {
      const canvas = dom('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      normalized = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(normalized);
    });
    return { data, width: bitmap.width, height: bitmap.height, name: file.name || '图片' };
  } finally { bitmap.close(); }
}
import { BLOCK_ARROWS, uid } from './document.js';
import { blockArrowPoints, gradientCss, gradientVector, shadowCss, textGradientStyle } from './appearance.js';
