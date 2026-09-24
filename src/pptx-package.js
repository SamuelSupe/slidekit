import JSZip from 'jszip';

export const EMU_PER_PIXEL = 9525;
const MB = 1024 * 1024;

export function children(node, name) {
  return Array.from(node?.childNodes || []).filter(child => child.nodeType === 1 && (!name || child.localName === name));
}

export function at(node, path) {
  return path.split('/').reduce((current, name) => children(current, name)[0], node);
}

export const attr = (node, name, fallback = '') => node?.getAttribute(name) ?? fallback;
export const numeric = (node, name, fallback = 0) => {
  const value = attr(node, name);
  return value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
};
export const relationshipId = (node, name = 'id') => Array.from(node?.attributes || []).find(attribute => attribute.localName === name && attribute.namespaceURI?.endsWith('/relationships'))?.value;

function resolvePart(source, target) {
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) throw new Error('PPTX 包含无效的内部资源地址');
  const segments = target.startsWith('/') ? [] : source.split('/').slice(0, -1);
  for (const part of decodeURIComponent(target).replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!segments.length) throw new Error('PPTX 资源地址超出文件包');
      segments.pop();
    } else segments.push(part);
  }
  return segments.join('/');
}

/** Decompress only referenced parts, bounding actual output rather than trusting ZIP metadata. */
export async function openPptxPackage(file, signal) {
  if (!(file instanceof Blob) || !file.size) throw new Error('请选择有效的 PPTX 文件');
  if (file.size > 200 * MB) throw new Error('PPTX 原文件不能超过 200 MB');
  signal?.throwIfAborted();
  const data = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  if (data[0] === 0xd0 && data[1] === 0xcf) throw new Error('此文件是旧版 PPT 或加密文稿，请先在 PowerPoint/WPS 中另存为未加密的 .pptx');
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('文件不是有效的 PPTX');
  let zip;
  try { zip = await JSZip.loadAsync(data); }
  catch { throw new Error('PPTX 文件已损坏或压缩格式不受支持'); }
  if (Object.keys(zip.files).length > 20000) throw new Error('PPTX 文件包中的资源过多');
  let totalBytes = 0;
  const xmlCache = new Map();
  const relationCache = new Map();
  async function read(path, limit = 64 * MB) {
    signal?.throwIfAborted();
    const entry = zip.file(path);
    if (!entry) throw new Error('PPTX 缺少资源：' + path);
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let finished = false;
      const stream = entry.internalStream('uint8array');
      const finish = (error) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', abort);
        if (error) { stream.pause(); chunks.length = 0; reject(error); return; }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        resolve(bytes);
      };
      const abort = () => finish(signal.reason || new DOMException('导入已取消', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      stream.on('data', chunk => {
        if (finished) return;
        size += chunk.length; totalBytes += chunk.length;
        if (size > limit || totalBytes > 500 * MB) { finish(new Error('PPTX 解压后的资源过大，请拆分文稿')); return; }
        chunks.push(chunk);
      }).on('error', error => finish(error)).on('end', () => finish()).resume();
    });
  }
  async function xml(path, optional = false) {
    if (optional && !zip.file(path)) return null;
    if (!xmlCache.has(path)) {
      const text = new TextDecoder().decode(await read(path, 16 * MB));
      if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('PPTX XML 包含不支持的实体声明');
      let parsed;
      try { parsed = new DOMParser().parseFromString(text, 'application/xml'); }
      catch { throw new Error('PPTX XML 已损坏：' + path); }
      if (!parsed.documentElement || parsed.getElementsByTagName('parsererror').length) throw new Error('PPTX XML 已损坏：' + path);
      xmlCache.set(path, parsed.documentElement);
    }
    return xmlCache.get(path);
  }
  async function relationships(path) {
    if (!relationCache.has(path)) {
      const index = path.lastIndexOf('/');
      const relPath = path.slice(0, index + 1) + '_rels/' + path.slice(index + 1) + '.rels';
      const root = await xml(relPath, true);
      const result = new Map();
      for (const relation of children(root, 'Relationship')) {
        const external = attr(relation, 'TargetMode') === 'External';
        result.set(attr(relation, 'Id'), {
          type: attr(relation, 'Type').split('/').at(-1), external,
          path: external ? '' : resolvePart(path, attr(relation, 'Target')),
        });
      }
      relationCache.set(path, result);
    }
    return relationCache.get(path);
  }
  return { read, xml, relationships, has: path => Boolean(zip.file(path)) };
}
