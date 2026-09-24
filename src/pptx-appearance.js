import JSZip from 'jszip';
import { at, attr, children, EMU_PER_PIXEL, numeric } from './pptx-package.js';
import { readColor } from './pptx-color.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angle = degrees => ((degrees % 360) + 360) % 360;
const enabled = (node, key) => !['0', 'false'].includes(attr(node, key));

export function readGradient(fill, theme, warn) {
  if (!fill) return null;
  const stops = children(at(fill, 'gsLst'), 'gs');
  if (!at(fill, 'lin') || stops.length < 2 || stops.length > 32) {
    warn('路径渐变或不支持的渐变色标已简化为纯色');
    return null;
  }
  if (Array.from(at(fill, 'tileRect')?.attributes || []).some(item => Number(item.value) !== 0)) warn('渐变平铺范围已简化为对象边界');
  return {
    type: 'linear', angle: angle(numeric(at(fill, 'lin'), 'ang') / 60000),
    scaled: enabled(at(fill, 'lin'), 'scaled'), rotateWithShape: enabled(fill, 'rotWithShape'),
    stops: stops.map(stop => ({ offset: clamp(numeric(stop, 'pos') / 100000, 0, 1), ...readColor(stop, theme) })).sort((a, b) => a.offset - b.offset),
  };
}

export function readShadow(properties, theme, warn) {
  const effects = children(at(properties, 'effectLst'));
  if (at(properties, 'effectDag')) warn('组合外观效果未导入');
  const shadow = effects.find(effect => effect.localName === 'outerShdw');
  if (effects.some(effect => effect.localName !== 'outerShdw')) warn('内阴影、发光、反射等外观效果未导入');
  if (!shadow) return null;
  if (['sx', 'sy'].some(key => numeric(shadow, key, 100000) !== 100000) || ['kx', 'ky'].some(key => numeric(shadow, key) !== 0)) warn('阴影缩放和倾斜已简化');
  const direction = numeric(shadow, 'dir') / 60000 * Math.PI / 180;
  const distance = numeric(shadow, 'dist') / EMU_PER_PIXEL;
  return {
    ...readColor(shadow, theme, '#000000'),
    blur: clamp(numeric(shadow, 'blurRad') / EMU_PER_PIXEL, 0, 1000),
    offsetX: clamp(Math.cos(direction) * distance, -10000, 10000),
    offsetY: clamp(Math.sin(direction) * distance, -10000, 10000),
    rotateWithShape: enabled(shadow, 'rotWithShape'),
  };
}

const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
function xmlNode(document, name, attributes = {}, content = []) {
  const node = document.createElementNS(DRAWING_NS, 'a:' + name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  for (const child of content) node.appendChild(child);
  return node;
}

function xmlColor(document, color, opacity) {
  return xmlNode(document, 'srgbClr', { val: color.slice(1).toUpperCase() }, [xmlNode(document, 'alpha', { val: Math.round(opacity * 100000) })]);
}

function writeGradient(owner, gradient, opacity = 1) {
  const document = owner.ownerDocument;
  const fill = xmlNode(document, 'gradFill', { rotWithShape: Number(gradient.rotateWithShape) }, [
    xmlNode(document, 'gsLst', {}, gradient.stops.map(stop => xmlNode(document, 'gs', { pos: Math.round(stop.offset * 100000) }, [xmlColor(document, stop.color, stop.opacity * opacity)]))),
    xmlNode(document, 'lin', { ang: Math.round(angle(gradient.angle) * 60000), scaled: Number(gradient.scaled) }),
  ]);
  for (const child of children(owner)) if (['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'].includes(child.localName)) owner.removeChild(child);
  const following = ['effectLst', 'effectDag', 'highlight', 'uLnTx', 'uLn', 'uFillTx', 'uFill', 'latin', 'ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'scene3d', 'sp3d', 'extLst'];
  if (owner.localName !== 'rPr') following.unshift('ln');
  owner.insertBefore(fill, children(owner).find(child => following.includes(child.localName)) || null);
}

function writeShadow(owner, shadow) {
  const document = owner.ownerDocument;
  // Keep the shadow's own alpha; baking element alpha into it compounds each round trip.
  for (const child of children(owner, 'effectLst')) owner.removeChild(child);
  const effect = xmlNode(document, 'effectLst', {}, [xmlNode(document, 'outerShdw', {
    blurRad: Math.round(shadow.blur * EMU_PER_PIXEL),
    dist: Math.round(Math.hypot(shadow.offsetX, shadow.offsetY) * EMU_PER_PIXEL),
    dir: Math.round(angle(Math.atan2(shadow.offsetY, shadow.offsetX) * 180 / Math.PI) * 60000),
    algn: 'ctr', rotWithShape: Number(shadow.rotateWithShape),
  }, [xmlColor(document, shadow.color, shadow.opacity)])]);
  owner.insertBefore(effect, children(owner).find(child => ['scene3d', 'sp3d', 'extLst'].includes(child.localName)) || null);
}

function writeConnectorPath(owner, points) {
  const document = owner.ownerDocument;
  const path = xmlNode(document, 'path', { w: 1000000, h: 1000000, fill: 'none' }, points.map((point, index) =>
    xmlNode(document, index ? 'lnTo' : 'moveTo', {}, [xmlNode(document, 'pt', { x: Math.round(point.x * 1000000), y: Math.round(point.y * 1000000) })])));
  const geometry = xmlNode(document, 'custGeom', {}, [
    xmlNode(document, 'avLst'), xmlNode(document, 'gdLst'), xmlNode(document, 'ahLst'), xmlNode(document, 'cxnLst'),
    xmlNode(document, 'rect', { l: 'l', t: 't', r: 'r', b: 'b' }), xmlNode(document, 'pathLst', {}, [path]),
  ]);
  owner.replaceChild(geometry, at(owner, 'prstGeom'));
}

/** PptxGenJS has no native gradient option. Add DrawingML paint to its editable objects. */
export async function writePptxAppearance(bytes, slides) {
  if (!slides.some(slide => slide.gradient || slide.objects.some(({ element, runs }) => element.gradient || element.shadow || element.points || element.arrowShaft !== undefined || element.arrowHead !== undefined || runs?.some(run => run.options.gradient)))) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  for (let index = 0; index < slides.length; index++) {
    const source = slides[index];
    const path = 'ppt/slides/slide' + (index + 1) + '.xml';
    const document = new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml');
    const root = document.documentElement;
    if (source.gradient) writeGradient(at(root, 'cSld/bg/bgPr'), source.gradient);
    const objects = new Map(source.objects.map(object => [object.name, object]));
    for (const node of children(at(root, 'cSld/spTree'))) {
      const name = attr(at(node, node.localName === 'pic' ? 'nvPicPr/cNvPr' : 'nvSpPr/cNvPr'), 'name');
      const object = objects.get(name);
      if (!object) continue;
      const { element, runs } = object;
      const properties = at(node, 'spPr');
      if (element.gradient) writeGradient(properties, element.gradient, element.opacity * (element.fillOpacity ?? 1));
      if (element.shadow) writeShadow(properties, element.shadow);
      if (element.points) writeConnectorPath(properties, element.points);
      if (element.arrowShaft !== undefined || element.arrowHead !== undefined) {
        const adjustments = at(properties, 'prstGeom/avLst');
        for (const [key, name] of [['arrowShaft', 'adj1'], ['arrowHead', 'adj2']]) {
          if (element[key] !== undefined) adjustments.appendChild(xmlNode(document, 'gd', { name, fmla: 'val ' + Math.round(element[key] * 100000) }));
        }
      }
      if (runs?.some(run => run.options.gradient)) {
        const expected = runs.filter(run => run.text);
        const actual = children(at(node, 'txBody'), 'p').flatMap(paragraph => children(paragraph, 'r')).filter(run => at(run, 't')?.textContent);
        if (actual.length !== expected.length || actual.some((run, i) => at(run, 't').textContent !== expected[i].text)) throw new Error('PPTX 渐变文字的导出分段不匹配');
        actual.forEach((run, i) => {
          const { gradient, transparency } = expected[i].options;
          if (gradient) writeGradient(at(run, 'rPr'), gradient, 1 - transparency / 100);
        });
      }
    }
    zip.file(path, new XMLSerializer().serializeToString(document));
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
