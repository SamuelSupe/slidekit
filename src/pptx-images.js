import { imageSize } from 'image-size';
import { at, children, relationshipId } from './pptx-package.js';

/** Prefer Office's compatibility fallback, then try explicitly declared alternatives. */
export function pictureChildren(node, name) {
  const result = children(node, name);
  const pending = children(node, 'AlternateContent');
  while (pending.length) {
    const alternative = pending.shift();
    for (const branch of [...children(alternative, 'Fallback'), ...children(alternative, 'Choice')]) {
      result.push(...children(branch, name));
      pending.push(...children(branch, 'AlternateContent'));
    }
  }
  return result;
}

export function resolvePicture(fills, relationships, hasPart) {
  const problems = new Set();
  for (const fill of fills) {
    for (const blip of pictureChildren(fill, 'blip')) {
      const svgReferences = children(at(blip, 'extLst'), 'ext').flatMap(extension => children(extension, 'svgBlip'));
      // A raster fallback is optional: some Office files only contain svgBlip.
      for (const reference of [blip, ...svgReferences]) {
        const id = relationshipId(reference, 'embed') || relationshipId(reference, 'link');
        if (!id) continue;
        const relation = relationships.get(id);
        if (!relation) { problems.add('图片关系 ' + id + ' 缺失'); continue; }
        if (relation.external) { problems.add('图片使用外部链接，请在原文稿中嵌入图片'); continue; }
        if (relation.type !== 'image') { problems.add('关系 ' + id + ' 不是图片'); continue; }
        if (!hasPart(relation.path)) { problems.add('缺少图片文件 ' + relation.path); continue; }
        const type = /\.jpe?g$/i.test(relation.path) ? 'jpeg' : /\.png$/i.test(relation.path) ? 'png' : /\.svg$/i.test(relation.path) ? 'svg' : null;
        if (!type) { problems.add('图片格式暂不支持：' + relation.path.split('/').at(-1)); continue; }
        return { path: relation.path, type, fill, blip };
      }
    }
  }
  return { problem: [...problems].join('；') || '未包含内嵌图片引用，可能是空图片占位符' };
}

/**
 * SVG is decoded only in an image context, never inserted into the page DOM.
 * This keeps scripts and external resource loading disabled while producing portable PNG.
 */
export async function rasterizeSvg(bytes, crop, mirrored, signal) {
  signal?.throwIfAborted();
  const source = new TextDecoder().decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('SVG 含不支持的实体声明');
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root?.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || parsed.getElementsByTagName('parsererror').length) throw new Error('SVG 内容无效');
  const dimensions = imageSize(bytes);
  if (![dimensions.width, dimensions.height].every(value => Number.isFinite(value) && value > 0)) throw new Error('SVG 尺寸无效');
  const scale = Math.min(2, 2560 / Math.max(dimensions.width, dimensions.height), Math.sqrt(4000000 / (dimensions.width * dimensions.height)));
  const width = Math.max(1, Math.floor(dimensions.width * scale)), height = Math.max(1, Math.floor(dimensions.height * scale));
  if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', '0 0 ' + dimensions.width + ' ' + dimensions.height);
  root.setAttribute('width', String(width)); root.setAttribute('height', String(height));
  const blob = new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        image.onload = image.onerror = null;
        if (error) reject(error); else resolve();
      };
      const abort = () => finish(signal.reason || new DOMException('导入已取消', 'AbortError'));
      const timer = setTimeout(() => finish(new Error('SVG 解码超时')), 10000);
      signal?.addEventListener('abort', abort, { once: true });
      image.onload = () => finish();
      image.onerror = () => finish(new Error('浏览器无法解码此 SVG'));
      image.src = url;
    });
    signal?.throwIfAborted();
    const [left, top, right, bottom] = crop;
    const cropWidth = width * (1 - left - right), cropHeight = height * (1 - top - bottom);
    if (cropWidth <= 0 || cropHeight <= 0) throw new Error('SVG 图片裁剪范围无效');
    const outputScale = Math.min(1, 2560 / Math.max(cropWidth, cropHeight), Math.sqrt(4000000 / (cropWidth * cropHeight)));
    canvas.width = Math.max(1, Math.floor(cropWidth * outputScale));
    canvas.height = Math.max(1, Math.floor(cropHeight * outputScale));
    const context = canvas.getContext('2d');
    if (mirrored) { context.translate(0, canvas.height); context.scale(1, -1); }
    context.drawImage(image, left * width, top * height, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  } finally {
    image.src = ''; URL.revokeObjectURL(url); canvas.width = canvas.height = 0;
  }
}
