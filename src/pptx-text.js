import { at, attr, children, numeric } from './pptx-package.js';

import { readColor } from './pptx-color.js';
import { readGradient } from './pptx-appearance.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function fontName(value, theme) {
  const name = theme.fonts[value] || value || 'Arial';
  return /^[\p{L}\p{N} ,._-]{1,100}$/u.test(name) ? name : 'Arial';
}

function runStyle(nodes, theme, warn) {
  const style = { fontSize: 18, fontFamily: 'Arial', color: '#202a3a', opacity: 1, bold: false, italic: false, underline: false };
  for (const node of nodes.filter(Boolean)) {
    if (attr(node, 'sz')) style.fontSize = clamp(numeric(node, 'sz') / 100, 1, 256);
    const font = attr(at(node, 'ea'), 'typeface') || attr(at(node, 'latin'), 'typeface');
    if (font) style.fontFamily = fontName(font, theme);
    if (at(node, 'solidFill')) { Object.assign(style, readColor(at(node, 'solidFill'), theme)); style.gradient = null; }
    if (at(node, 'gradFill')) {
      style.gradient = readGradient(at(node, 'gradFill'), theme, warn);
      style.color = style.gradient?.stops[0].color || readColor(at(node, 'gradFill/gsLst/gs'), theme).color;
      style.opacity = 1;
    }
    for (const [key, name] of [['bold', 'b'], ['italic', 'i'], ['underline', 'u']]) {
      if (node.hasAttribute(name)) style[key] = !['0', 'false', 'none'].includes(attr(node, name));
    }
  }
  return style;
}

/** Inherited paragraph properties are merged before each run's direct formatting. */
export function readText(body, { theme, defaults = [], inheritedBodies = [], warn }) {
  const content = [];
  const paints = [];
  let firstStyle;
  for (const paragraph of children(body, 'p')) {
    const direct = at(paragraph, 'pPr');
    const level = clamp(numeric(direct, 'lvl'), 0, 8);
    const levelName = 'lvl' + (level + 1) + 'pPr';
    const properties = [
      ...defaults.map(node => at(node, levelName)),
      ...inheritedBodies.flatMap(node => [at(node, 'lstStyle/' + levelName), at(node, 'p/pPr')]),
      at(body, 'lstStyle/' + levelName), direct,
    ].filter(Boolean);
    let align = 'left', lineHeight = 1.2, list = null, start = 1;
    for (const property of properties) {
      align = { l: 'left', ctr: 'center', r: 'right', just: 'justify' }[attr(property, 'algn')] || align;
      const spacing = at(property, 'lnSpc/spcPct');
      if (spacing) lineHeight = clamp(numeric(spacing, 'val', 120000) / 100000, 0.8, 3);
      if (at(property, 'lnSpc/spcPts')) warn('固定磅值行距按比例行距显示');
      if (at(property, 'buNone')) list = null;
      if (at(property, 'buChar')) list = 'bulletList';
      if (at(property, 'buAutoNum')) { list = 'orderedList'; start = clamp(numeric(at(property, 'buAutoNum'), 'startAt', 1), 1, 9999); }
    }
    if (level) warn('多级列表保留文字和列表标记，缩进已简化');
    const base = properties.map(node => at(node, 'defRPr'));
    const runs = [];
    for (const run of children(paragraph)) {
      if (run.localName === 'br') { runs.push({ type: 'hardBreak' }); continue; }
      if (!['r', 'fld'].includes(run.localName)) continue;
      const text = at(run, 't')?.textContent;
      if (!text) continue;
      const style = runStyle([...base, at(run, 'rPr')], theme, warn);
      firstStyle ||= style;
      const marks = ['bold', 'italic', 'underline'].filter(key => style[key]).map(type => ({ type }));
      const attrs = { fontSize: style.fontSize + 'pt', fontFamily: style.fontFamily, color: style.color, ...(style.gradient ? { gradient: style.gradient } : {}), ...(style.opacity !== 1 ? { opacity: style.opacity } : {}) };
      paints.push(attrs);
      marks.push({ type: 'textStyle', attrs });
      runs.push({ type: 'text', text, marks });
    }
    const node = { type: 'paragraph', attrs: { textAlign: align, lineHeight: String(lineHeight) }, content: runs };
    if (list) {
      const previous = content.at(-1);
      const item = { type: 'listItem', content: [node] };
      if (previous?.type === list && (list === 'bulletList' || start === 1)) previous.content.push(item);
      else content.push({ type: list, ...(list === 'orderedList' ? { attrs: { start } } : {}), content: [item] });
    } else content.push(node);
  }
  const style = firstStyle || runStyle([], theme, warn);
  // Uniform text alpha belongs to the whole text box; mixed fills retain their
  // own alpha instead of making every run inherit the first run's opacity.
  const opacity = paints.length && paints.every(paint => !paint.gradient && (paint.opacity ?? 1) === style.opacity) ? style.opacity : 1;
  if (opacity !== 1) paints.forEach(paint => { delete paint.opacity; });
  return { content: { type: 'doc', content: content.length ? content : [{ type: 'paragraph', content: [] }] }, fontSize: style.fontSize, fontFamily: style.fontFamily, color: style.color, lineHeight: 1.2, opacity };
}
