import PptxGenJS from 'pptxgenjs';
import { validateDocument } from './document.js';
import { writePptxAppearance } from './pptx-appearance.js';

const inch = px => px / 96;
const hex = color => color.slice(1).toUpperCase();
// XML 1.0 cannot represent these code points. Keep JSON lossless and replace
// only at the export boundary, including lone surrogates from pasted/API text.
const xmlText = text => text.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '\uFFFD');

function paragraphs(content, list = null, depth = 0) {
  const result = [];
  for (const node of content.content || []) {
    if (node.type === 'paragraph') result.push({ node, list, depth });
    else if (node.type === 'bulletList' || node.type === 'orderedList') {
      node.content.forEach((item, index) => {
        const marker = { type: node.type, number: (node.attrs?.start || 1) + index };
        let first = true;
        for (const child of item.content) {
          if (child.type === 'paragraph') {
            result.push({ node: child, list: first ? marker : null, depth });
            first = false;
          } else result.push(...paragraphs({ content: [child] }, null, depth + 1));
        }
      });
    }
  }
  return result;
}

export function textRuns(element) {
  const result = [];
  const blocks = paragraphs(element.content);
  blocks.forEach(({ node, list, depth }, paragraphIndex) => {
    const common = {
      align: node.attrs?.textAlign || 'left',
      lineSpacingMultiple: Number(node.attrs?.lineHeight || element.lineHeight),
      paraSpaceAfter: 0, paraSpaceBefore: 0,
      transparency: (1 - element.opacity) * 100,
    };
    if (list) {
      common.bullet = list.type === 'orderedList'
        ? { type: 'number', startAt: list.number, indent: element.fontSize * 1.35 }
        : { indent: element.fontSize * 1.35 };
      common.indentLevel = depth;
      common.hanging = element.fontSize * 0.35;
    }
    // PptxGenJS ignores softBreakBefore on the first run of a paragraph.
    // An empty leading run keeps leading/consecutive breaks without adding text.
    const runs = [{ text: '', options: { ...common } }];
    for (const child of node.content || []) {
      if (child.type === 'hardBreak') {
        runs.push({ text: '', options: { ...common, softBreakBefore: true } });
        continue;
      }
      const options = { ...common };
      for (const mark of child.marks || []) {
        if (mark.type === 'bold') options.bold = true;
        if (mark.type === 'italic') options.italic = true;
        if (mark.type === 'underline') options.underline = { style: 'sng' };
        if (mark.type === 'textStyle') {
          if (mark.attrs.fontSize) options.fontSize = parseFloat(mark.attrs.fontSize);
          if (mark.attrs.fontFamily) options.fontFace = mark.attrs.fontFamily;
          if (mark.attrs.color) options.color = hex(mark.attrs.color);
          if (mark.attrs.gradient) options.gradient = mark.attrs.gradient;
          if (mark.attrs.opacity !== undefined) options.transparency = (1 - element.opacity * mark.attrs.opacity) * 100;
        }
      }
      // Do not let PptxGenJS split raw newlines: trailing newlines follow a
      // different code path there and break the mapping of gradient text runs.
      xmlText(child.text).split(/\r\n|\r|\n/).forEach((text, index) => {
        if (index) runs.push({ text: '', options: { ...options, softBreakBefore: true } });
        if (text) runs.push({ text, options: { ...options } });
      });
    }
    if (runs.length === 1) runs[0].text = ' ';
    if (paragraphIndex < blocks.length - 1) runs.at(-1).options.breakLine = true;
    result.push(...runs);
  });
  return result;
}

/**
 * Produces editable native shapes and text boxes; no slide screenshots are used.
 * @param {import('./types.js').Deck} input
 * @returns {Promise<Blob>}
 */
export async function exportPptx(input) {
  const doc = validateDocument(input);
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'SLIDEKIT', width: inch(doc.width), height: inch(doc.height) });
  pptx.layout = 'SLIDEKIT';
  pptx.author = 'SlideKit';
  pptx.subject = 'SlideKit presentation';
  pptx.title = xmlText(doc.title);
  pptx.lang = 'zh-CN';
  pptx.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial', lang: 'zh-CN' };
  const appearance = [];
  for (const source of doc.slides) {
    const slide = pptx.addSlide();
    slide.hidden = source.hidden === true;
    slide.background = { color: hex(source.background) };
    const objects = [];
    appearance.push({ gradient: source.backgroundGradient, objects });
    for (const [index, element] of source.elements.entries()) {
      const objectName = { text: '文字', shape: '形状', image: '图片' }[element.type] + ' ' + (index + 1);
      const object = { name: objectName, element, runs: null };
      objects.push(object);
      const bounds = { x: inch(element.x), y: inch(element.y), w: inch(element.width), h: inch(element.height) };
      const rotate = ((element.rotation % 360) + 360) % 360;
      const transparency = (1 - element.opacity) * 100;
      if (element.type === 'text') {
        object.runs = textRuns(element);
        slide.addText(object.runs.map(run => ({ ...run, options: { ...run.options } })), {
          ...bounds, objectName, rotate, transparency, margin: 0, breakLine: false,
          fontFace: element.fontFamily, fontSize: element.fontSize, color: hex(element.color),
          valign: 'top', lineSpacingMultiple: element.lineHeight, paraSpaceAfter: 0,
          lang: 'zh-CN', isTextBox: true, fit: 'none',
        });
      } else if (element.type === 'shape') {
        const lineShape = element.shape === 'line' || element.shape === 'arrow';
        slide.addShape(lineShape ? pptx.ShapeType.line : pptx.ShapeType[element.shape], {
          ...bounds,
          objectName,
          ...(lineShape && !element.points ? { y: bounds.y + bounds.h / 2, h: 0 } : {}),
          rotate,
          rectRadius: element.shape === 'roundRect' ? inch(Math.min(element.width, element.height) * 0.12) : undefined,
          fill: { color: element.fill === 'transparent' ? 'FFFFFF' : hex(element.fill), transparency: element.fill === 'transparent' ? 100 : (1 - element.opacity * (element.fillOpacity ?? 1)) * 100 },
          line: {
            color: hex(element.stroke), width: (lineShape ? Math.max(1, element.strokeWidth) : element.strokeWidth) * 0.75,
            transparency: !lineShape && element.strokeWidth === 0 ? 100 : (1 - element.opacity * (element.strokeOpacity ?? 1)) * 100,
            ...(lineShape ? { beginArrowType: element.startArrow || 'none', endArrowType: element.endArrow ?? (element.shape === 'arrow' ? 'triangle' : 'none') } : {}),
          },
        });
      } else {
        const asset = doc.assets[element.assetId];
        const sizing = { type: element.fit, w: bounds.w, h: bounds.h };
        slide.addImage({
          data: asset.data, x: bounds.x, y: bounds.y,
          w: inch(asset.width), h: inch(asset.height), sizing,
          objectName, rotate, transparency, altText: xmlText(asset.name),
        });
      }
    }
  }
  const bytes = await pptx.write({ outputType: 'arraybuffer', compression: true });
  return new Blob([await writePptxAppearance(bytes, appearance)], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
