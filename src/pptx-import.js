import { imageSize } from 'image-size';
import { ARROW_ENDS, BLOCK_ARROWS, SHAPES, createDocument, createElement, emptySlide, MAX_SLIDES, uid, validateDocument } from './document.js';
import { at, attr, children, EMU_PER_PIXEL, numeric, openPptxPackage, relationshipId } from './pptx-package.js';
import { readText } from './pptx-text.js';
import { readColor, readTheme } from './pptx-color.js';
import { readGradient, readShadow } from './pptx-appearance.js';
import { pictureChildren, rasterizeSvg, resolvePicture } from './pptx-images.js';
import { readConnectorPoints } from './pptx-connectors.js';
import { createTranslator } from './i18n.js';

const identity = [1, 0, 0, 1, 0, 0];
const px = (node, key, fallback = 0) => numeric(node, key, fallback * EMU_PER_PIXEL) / EMU_PER_PIXEL;
const truth = value => value === '1' || value === 'true';
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const translate = (x, y) => [1, 0, 0, 1, x, y];
const point = (m, x, y) => ({ x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] });

function transform(node, parent, group = false) {
  const offset = at(node, 'off'), extent = at(node, 'ext');
  const width = px(extent, 'cx'), height = px(extent, 'cy');
  const angle = numeric(node, 'rot') / 60000 * Math.PI / 180;
  const flipX = truth(attr(node, 'flipH')) ? -1 : 1, flipY = truth(attr(node, 'flipV')) ? -1 : 1;
  const rotate = [Math.cos(angle)*flipX, Math.sin(angle)*flipX, -Math.sin(angle)*flipY, Math.cos(angle)*flipY, 0, 0];
  let matrix = multiply(parent, translate(px(offset, 'x') + width/2, px(offset, 'y') + height/2));
  matrix = multiply(multiply(matrix, rotate), translate(-width/2, -height/2));
  if (group) {
    const childExtent = at(node, 'chExt'), childOffset = at(node, 'chOff');
    matrix = multiply(matrix, [width / (px(childExtent, 'cx') || width || 1), 0, 0, height / (px(childExtent, 'cy') || height || 1), 0, 0]);
    matrix = multiply(matrix, translate(-px(childOffset, 'x'), -px(childOffset, 'y')));
  }
  return { matrix, width, height };
}

function bounds(matrix, width, height, x = 0, y = 0) {
  const center = point(matrix, x + width/2, y + height/2);
  const w = Math.max(1, width * Math.hypot(matrix[0], matrix[1]));
  const h = Math.max(1, height * Math.hypot(matrix[2], matrix[3]));
  return { x: center.x-w/2, y: center.y-h/2, width: w, height: h, rotation: Math.atan2(matrix[1], matrix[0])*180/Math.PI };
}

function placeholder(node) {
  for (const name of ['nvSpPr', 'nvPicPr', 'nvGraphicFramePr']) {
    const ph = at(node, name + '/nvPr/ph');
    if (ph) return { index: attr(ph, 'idx', '0'), type: attr(ph, 'type', 'body') };
  }
}

function inheritedShape(root, ph, byType = false) {
  if (!ph) return null;
  return children(at(root, 'cSld/spTree')).find(node => {
    const candidate = placeholder(node);
    return candidate && (byType ? candidate.type === ph.type || (ph.type === 'ctrTitle' && candidate.type === 'title') : candidate.index === ph.index);
  });
}

function base64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

/**
 * Reads supported editable objects locally. Warnings describe fidelity changes.
 * @param {File | Blob} file
 * @param {{signal?: AbortSignal, onProgress?: (progress: {page: number, total: number}) => void, t?: ReturnType<typeof createTranslator>}} [options]
 * @returns {Promise<{document: import('./types.js').Deck, warnings: string[]}>}
 */
export async function readPptx(file, { signal, onProgress, t = createTranslator() } = {}) {
  const archive = await openPptxPackage(file, signal);
  const rootRelations = await archive.relationships('');
  const presentationPath = [...rootRelations.values()].find(relation => relation.type === 'officeDocument' && !relation.external)?.path;
  if (!presentationPath) throw new Error('文件不是有效的 PowerPoint PPTX 文稿');
  const presentation = await archive.xml(presentationPath);
  if (presentation.localName !== 'presentation') throw new Error('请选择 PowerPoint .pptx 文稿');
  const slideIds = children(at(presentation, 'sldIdLst'), 'sldId');
  if (!slideIds.length || slideIds.length > MAX_SLIDES) throw new Error('PPTX 须包含 1–' + MAX_SLIDES + ' 页');
  const doc = createDocument((file.name || t('PowerPoint 文稿')).replace(/\.pptx$/i, '').slice(0, 500));
  doc.width = px(at(presentation, 'sldSz'), 'cx'); doc.height = px(at(presentation, 'sldSz'), 'cy');
  if (doc.width < 100 || doc.height < 100 || doc.width > 10000 || doc.height > 10000) throw new Error('PPTX 页面尺寸超出支持范围');
  doc.slides = [];
  const warnings = new Set();
  const assets = new Map();
  let pageNumber = 0;
  const warn = message => warnings.add('第 ' + pageNumber + ' 页：' + message);
  const presentationRelations = await archive.relationships(presentationPath);
  async function related(path, type) {
    const relationship = [...(await archive.relationships(path)).values()].find(item => item.type === type && !item.external);
    return relationship ? { path: relationship.path, root: await archive.xml(relationship.path) } : null;
  }
  async function image(fills, source, mirrored = false, label = t('背景图片')) {
    const selected = resolvePicture(fills, await archive.relationships(source), archive.has);
    const skip = reason => { warn(label + '（' + source + '）：' + reason + '，已跳过'); return null; };
    if (selected.problem) return skip(selected.problem);
    const { path, type, fill, blip } = selected;
    const crop = at(fill, 'srcRect');
    const sides = ['l', 't', 'r', 'b'].map(side => numeric(crop, side) / 100000);
    const key = path + ':' + sides.join(',') + ':' + mirrored;
    const opacity = numeric(at(blip, 'alphaModFix'), 'amt', 100000) / 100000;
    if (assets.has(key)) return { assetId: assets.get(key), opacity };
    const bytes = await archive.read(path, type === 'svg' ? 16 * 1024 * 1024 : undefined);
    if (type === 'svg') {
      let rendered;
      try { rendered = await rasterizeSvg(bytes, sides, mirrored, signal); }
      catch (error) { signal?.throwIfAborted(); return skip('SVG ' + path + '：' + error.message); }
      const assetId = uid();
      doc.assets[assetId] = { ...rendered, name: path.split('/').at(-1).replace(/\.svg$/i, '.png') };
      assets.set(key, assetId);
      return { assetId, opacity };
    }
    let dimensions;
    try { dimensions = imageSize(bytes); } catch { throw new Error('PPTX 中的图片已损坏：' + path); }
    if (dimensions.width * dimensions.height > 40000000) throw new Error('PPTX 单张图片不能超过 4000 万像素');
    let asset = { data: 'data:image/' + type + ';base64,' + base64(bytes), width: dimensions.width, height: dimensions.height, name: path.split('/').at(-1) };
    if (sides.some(value => value !== 0) || mirrored) {
      const [left, top, right, bottom] = sides;
      const cropWidth = 1-left-right, cropHeight = 1-top-bottom;
      if (cropWidth <= 0 || cropHeight <= 0) throw new Error('PPTX 图片裁剪范围无效');
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/' + type }));
      const canvas = document.createElement('canvas');
      try {
        const scale = Math.min(1, Math.sqrt(4000000/(asset.width*cropWidth*asset.height*cropHeight)));
        canvas.width = Math.max(1, Math.round(asset.width*cropWidth*scale));
        canvas.height = Math.max(1, Math.round(asset.height*cropHeight*scale));
        const context = canvas.getContext('2d');
        if (mirrored) { context.translate(0, canvas.height); context.scale(1, -1); }
        context.drawImage(bitmap, left*asset.width, top*asset.height, cropWidth*asset.width, cropHeight*asset.height, 0, 0, canvas.width, canvas.height);
        asset = { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, name: asset.name.replace(/\.[^.]+$/, '') + '.png' };
      } finally { bitmap.close(); canvas.width = canvas.height = 0; }
    }
    signal?.throwIfAborted();
    const id = uid(); doc.assets[id] = asset; assets.set(key, id);
    return { assetId: id, opacity };
  }
  for (const slideId of slideIds) {
    signal?.throwIfAborted(); pageNumber += 1;
    onProgress?.({ page: pageNumber, total: slideIds.length });
    const reference = presentationRelations.get(relationshipId(slideId));
    if (!reference || reference.external || reference.type !== 'slide') throw new Error('PPTX 页面引用无效');
    const source = reference.path;
    const root = await archive.xml(source);
    const layout = await related(source, 'slideLayout');
    const master = layout && await related(layout.path, 'slideMaster');
    const themePart = (master && await related(master.path, 'theme')) || await related(presentationPath, 'theme');
    const colorMap = at(root, 'clrMapOvr/overrideClrMapping') || at(layout?.root, 'clrMapOvr/overrideClrMapping') || at(master?.root, 'clrMap');
    const theme = readTheme(themePart?.root, colorMap);
    const slide = emptySlide(attr(at(root, 'cSld'), 'name') || t('幻灯片 {number}', { number: pageNumber }));
    if (['0', 'false'].includes(attr(root, 'show'))) {
      slide.hidden = true;
      warn('隐藏页面已保留，放映时自动跳过');
    }
    const add = element => {
      if (slide.elements.length >= 2000) throw new Error('PPTX 单页对象超过 2000 个');
      slide.elements.push(element);
    };
    const backgroundOwner = [{ root, path: source }, layout, master].find(item => at(item?.root, 'cSld/bg'));
    const background = at(backgroundOwner?.root, 'cSld/bg/bgPr');
    const backgroundReference = at(backgroundOwner?.root, 'cSld/bg/bgRef');
    if (backgroundReference) {
      slide.background = readColor(backgroundReference, theme, '#ffffff').color;
      const index = numeric(backgroundReference, 'idx');
      const paint = children(at(themePart?.root, 'themeElements/fmtScheme/bgFillStyleLst'))[index-1001];
      const backgroundTheme = { ...theme, colors: { ...theme.colors, phClr: slide.background.slice(1) } };
      if (paint?.localName === 'solidFill') slide.background = readColor(paint, backgroundTheme, slide.background).color;
      else if (paint?.localName === 'gradFill') slide.backgroundGradient = readGradient(paint, backgroundTheme, warn);
      else if (paint) warn('主题背景效果已简化为纯色');
    }
    if (at(background, 'solidFill')) slide.background = readColor(at(background, 'solidFill'), theme, '#ffffff').color;
    if (at(background, 'gradFill')) {
      slide.background = readColor(at(background, 'gradFill/gsLst/gs'), theme, '#ffffff').color;
      slide.backgroundGradient = readGradient(at(background, 'gradFill'), theme, warn);
    }
    if (pictureChildren(background, 'blipFill').length) {
      const picture = await image(pictureChildren(background, 'blipFill'), backgroundOwner.path);
      if (picture) add(createElement('image', { ...picture, x: 0, y: 0, width: doc.width, height: doc.height, locked: true, fit: 'cover' }));
    }
    if (at(root, 'timing') || at(root, 'transition')) warn('动画和切换效果未导入');
    async function visit(tree, path, parent = identity, inherited = false, depth = 0) {
      if (depth > 16) throw new Error('PPTX 组合对象嵌套过深');
      for (const node of children(tree)) {
        signal?.throwIfAborted();
        const kind = node.localName;
        if (['nvGrpSpPr', 'grpSpPr', 'extLst'].includes(kind)) continue;
        if (kind === 'AlternateContent') { await visit(at(node, 'Fallback') || at(node, 'Choice'), path, parent, inherited, depth + 1); continue; }
        const nonVisual = children(node).map(child => at(child, 'cNvPr')).find(Boolean);
        if (truth(attr(nonVisual, 'hidden'))) {
          warn('隐藏对象「' + (attr(nonVisual, 'name') || kind) + '」已跳过');
          continue;
        }
        const ph = placeholder(node);
        if (inherited && ph) continue;
        if (kind === 'grpSp') {
          const group = transform(at(node, 'grpSpPr/xfrm'), parent, true);
          await visit(node, path, group.matrix, inherited, depth + 1); continue;
        }
        const layoutShape = !inherited && inheritedShape(layout?.root, ph);
        const masterShape = !inherited && inheritedShape(master?.root, ph, true);
        const shapeProperties = at(node, 'spPr');
        const transformNode = at(node, 'spPr/xfrm') || at(node, 'xfrm') || at(layoutShape, 'spPr/xfrm') || at(masterShape, 'spPr/xfrm');
        if (!transformNode) { warn('一个对象缺少可用的位置，未导入'); continue; }
        const geometry = transform(transformNode, parent);
        const { matrix, width, height } = geometry;
        const box = bounds(matrix, width, height);
        const mirrored = matrix[0]*matrix[3]-matrix[1]*matrix[2] < 0;
        const shadow = readShadow(shapeProperties, theme, warn);
        if (Math.abs(matrix[0]*matrix[2]+matrix[1]*matrix[3]) > 0.001) warn('非等比旋转组合的倾斜已简化');
        if (kind === 'pic') {
          const name = attr(at(node, 'nvPicPr/cNvPr'), 'name') || t('图片');
          const picture = await image(pictureChildren(node, 'blipFill'), path, mirrored, name);
          if (picture) add(createElement('image', { ...box, ...picture, ...(shadow ? { shadow } : {}), fit: 'cover' }));
          continue;
        }
        if (!['sp', 'cxnSp'].includes(kind)) {
          warn(({ graphicFrame: '表格、图表或 SmartArt', contentPart: '扩展内容' }[kind] || '不支持的对象 ' + kind) + '未导入');
          continue;
        }
        const style = at(node, 'style');
        let fill = at(shapeProperties, 'solidFill');
        let gradientFill = at(shapeProperties, 'gradFill');
        let fillTheme = theme;
        if (!fill && !gradientFill && !at(shapeProperties, 'noFill') && numeric(at(style, 'fillRef'), 'idx') > 0) {
          fill = at(style, 'fillRef');
          const preset = children(at(themePart?.root, 'themeElements/fmtScheme/fillStyleLst'))[numeric(fill, 'idx') - 1];
          if (preset?.localName === 'gradFill') {
            gradientFill = preset;
            fillTheme = { ...theme, colors: { ...theme.colors, phClr: readColor(fill, theme).color.slice(1) } };
          }
        }
        const gradient = readGradient(gradientFill, fillTheme, warn);
        const line = at(shapeProperties, 'ln');
        const lineFill = at(line, 'solidFill') || (!at(line, 'noFill') && numeric(at(style, 'lnRef'), 'idx') > 0 && at(style, 'lnRef'));
        const fillColor = gradient?.stops[0] || readColor(gradientFill ? at(gradientFill, 'gsLst/gs') : fill, fillTheme, '#ffffff');
        const strokeColor = readColor(lineFill, theme, '#202a3a');
        const lineOpacity = at(line, 'noFill') ? 0 : strokeColor.opacity;
        const visibleFill = gradient || ((fill || gradientFill) && fillColor.opacity > 0);
        let shape = attr(at(shapeProperties, 'prstGeom'), 'prst') || 'rect';
        if (mirrored) shape = ({ upArrow: 'downArrow', downArrow: 'upArrow' })[shape] || shape;
        const connectorPoints = readConnectorPoints(shapeProperties);
        const lineShape = kind === 'cxnSp' || shape === 'line' || /^(bent|curved)Connector/.test(shape) || !!connectorPoints;
        const hasShape = lineShape || fill || lineFill || gradientFill;
        let shapeAdded = false;
        if (hasShape) {
          let supported = SHAPES.includes(shape);
          if (at(shapeProperties, 'custGeom')) supported = false;
          if (supported || lineShape) {
            // DrawingML stores fill and stroke alpha separately. Factor out a
            // common opacity without making a gradient's outline fully opaque.
            const opacity = lineShape ? lineOpacity : gradient
              ? Math.max(...gradient.stops.map(stop => stop.opacity), lineFill ? lineOpacity : 0)
              : visibleFill ? Math.max(fillColor.opacity, lineFill ? lineOpacity : 0) : lineOpacity;
            const props = {
              ...box, shape, fill: visibleFill ? fillColor.color : 'transparent',
              stroke: strokeColor.color, strokeWidth: lineFill || lineShape ? Math.min(30, px(line, 'w', 1)) : 0,
              opacity,
              ...(!lineShape && !gradient && visibleFill && opacity > 0 && fillColor.opacity !== opacity ? { fillOpacity: fillColor.opacity / opacity } : {}),
              ...(!lineShape && lineFill && opacity > 0 && lineOpacity !== opacity ? { strokeOpacity: lineOpacity / opacity } : {}),
              ...(gradient ? { gradient: {
                ...gradient, angle: mirrored ? (360 - gradient.angle) % 360 : gradient.angle,
                stops: gradient.stops.map(stop => ({ ...stop, opacity: opacity > 0 ? stop.opacity / opacity : stop.opacity })),
              } } : {}),
              ...(shadow ? { shadow } : {}),
            };
            if (BLOCK_ARROWS.includes(shape)) {
              for (const adjustment of children(at(shapeProperties, 'prstGeom/avLst'), 'gd')) {
                const key = { adj1: 'arrowShaft', adj2: 'arrowHead' }[attr(adjustment, 'name')];
                const value = /^val\s+(-?[\d.]+)$/.exec(attr(adjustment, 'fmla'));
                if (key && value) props[key] = Math.max(0, Math.min(key === 'arrowShaft' ? 1 : 100000, Number(value[1]) / 100000));
              }
            }
            if (lineShape) {
              const from = point(matrix, 0, 0), to = point(matrix, width, height);
              const head = attr(at(line, 'headEnd'), 'type', 'none') || 'none', tail = attr(at(line, 'tailEnd'), 'type', 'none') || 'none';
              const arrow = tail !== 'none' || head !== 'none';
              const length = Math.max(1, Math.hypot(to.x-from.x, to.y-from.y));
              Object.assign(props, {
                shape: arrow ? 'arrow' : 'line', startArrow: ARROW_ENDS.includes(head) ? head : 'triangle',
                endArrow: ARROW_ENDS.includes(tail) ? tail : 'triangle',
                x: (from.x+to.x)/2-length/2, y: (from.y+to.y)/2-6, width: length, height: 12,
                rotation: Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI,
              });
              if (connectorPoints) {
                const turn = -box.rotation * Math.PI / 180;
                const points = connectorPoints.map(position => {
                  const world = point(matrix, position.x * width, position.y * height);
                  const dx = world.x - box.x - box.width / 2, dy = world.y - box.y - box.height / 2;
                  return { x: (dx * Math.cos(turn) - dy * Math.sin(turn)) / box.width + 0.5, y: (dx * Math.sin(turn) + dy * Math.cos(turn)) / box.height + 0.5 };
                });
                if (points.some(point => Math.abs(point.x - points[0].x) + Math.abs(point.y - points[0].y) > 1e-10)) Object.assign(props, box, { points });
              } else if (shape !== 'line' || at(shapeProperties, 'custGeom')) warn('连接线 ' + shape + ' 的路径暂不支持，已按端点直线导入');
            }
            add(createElement('shape', props));
            shapeAdded = true;
          } else warn('形状 ' + shape + ' 未导入，内部文字仍保留');
        }
        const body = at(node, 'txBody');
        if (body && (truth(attr(at(node, 'nvSpPr/cNvSpPr'), 'txBox')) || children(body, 'p').some(paragraph => children(paragraph).some(run => run.localName === 'br' || at(run, 't')?.textContent)))) {
          const category = ph?.type?.includes('Title') || ph?.type === 'title' ? 'titleStyle' : ph?.type === 'body' || ph?.type === 'obj' ? 'bodyStyle' : 'otherStyle';
          const text = readText(body, { theme, defaults: [at(presentation, 'defaultTextStyle'), at(master?.root, 'txStyles/' + category)].filter(Boolean), inheritedBodies: [at(masterShape, 'txBody'), at(layoutShape, 'txBody')].filter(Boolean), warn });
          const bodyProperties = at(body, 'bodyPr');
          const left = px(bodyProperties, 'lIns', 9.6), right = px(bodyProperties, 'rIns', 9.6), top = px(bodyProperties, 'tIns', 4.8), bottom = px(bodyProperties, 'bIns', 4.8);
          const anchor = attr(bodyProperties, 'anchor');
          if (anchor && anchor !== 't') warn('文本垂直对齐已按顶部对齐导入');
          if (attr(bodyProperties, 'vert') && attr(bodyProperties, 'vert') !== 'horz') warn('竖排文字已按横排导入');
          if (mirrored) warn('镜像文字已按正常方向导入');
          add(createElement('text', { ...bounds(matrix, Math.max(1, width-left-right), Math.max(1, height-top-bottom), left, top), ...text, ...(!shapeAdded && shadow ? { shadow } : {}) }));
        }
      }
    }
    if (!['0', 'false'].includes(attr(root, 'showMasterSp')) && !['0', 'false'].includes(attr(layout?.root, 'showMasterSp'))) {
      if (master) await visit(at(master.root, 'cSld/spTree'), master.path, identity, true);
    }
    if (layout) await visit(at(layout.root, 'cSld/spTree'), layout.path, identity, true);
    await visit(at(root, 'cSld/spTree'), source);
    doc.slides.push(slide);
    // Let Cancel/Escape and the progress indicator run between slide conversions.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  signal?.throwIfAborted();
  return { document: validateDocument(doc), warnings: [...warnings] };
}
