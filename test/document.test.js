import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { writeFile } from 'node:fs/promises';
import { createDocument, createElement, paragraph, validateDocument } from '../src/document.js';
import { DocumentStore } from '../src/store.js';
import { alignElements, boundingBox, distributeElements } from '../src/geometry.js';
import { exportPptx } from '../src/pptx.js';
import { pdfPageLayout, readPdf, resolvePdfLimits } from '../src/pdf.js';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { readPptx } from '../src/pptx-import.js';
import { resolvePicture } from '../src/pptx-images.js';
import { gradientVector } from '../src/appearance.js';
import { plainText } from '../src/document.js';
import { at, children } from '../src/pptx-package.js';
import { normalizeText, RichTextSession } from '../src/rich-text.js';
import { SlideEditor } from '../src/editor.js';

globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const image = { data: png, width: 1, height: 1, name: 'pixel.png' };

test('PDF pages preserve aspect ratio and mixed orientations fit without clipping', () => {
  const first = pdfPageLayout(600, 800);
  assert.deepEqual(first.pageSize, { width: 960, height: 1280 });
  assert.equal(first.x, 0);
  assert.equal(first.y, 0);
  const landscape = pdfPageLayout(800, 600, first.pageSize);
  assert.equal(landscape.width / landscape.height, 800 / 600);
  assert.equal(landscape.x, 0);
  assert.equal(landscape.y, 280);
  assert.equal(landscape.width, 960);
  assert.throws(() => pdfPageLayout(0, 800));
  assert.throws(() => pdfPageLayout(NaN, 800));
});

test('PDF import rejects invalid files and cancellation before creating a worker', async () => {
  await assert.rejects(readPdf(new Blob(['not a pdf'])), /不是有效的 PDF/);
  await assert.rejects(readPdf(new Blob()), /有效的 PDF/);
  await assert.rejects(readPdf(new Blob(['%PDF-1.7']), { signal: AbortSignal.abort() }), { name: 'AbortError' });
});

test('PDF import enforces host limits, per-import overrides and the document page boundary', async () => {
  const limits = resolvePdfLimits({ maxFileSizeMB: 1, maxPages: 20, maxRenderedSizeMB: 2 }, { maxFileSizeMB: 3 });
  const file = new Blob([new Uint8Array(2 * 1024 * 1024)]);
  await assert.rejects(readPdf(file, { limits: { maxFileSizeMB: 1 } }), /2 MB.*1 MB/);
  // Reaching PDF format validation proves the per-import size override took effect.
  await assert.rejects(readPdf(file, { limits }), /不是有效的 PDF/);
  assert.equal(limits.maxPages, 20);
  assert.equal(limits.maxRenderedSizeMB, 2);
  await assert.rejects(readPdf(file, { limits: { maxRenderedSizeMB: Infinity } }), TypeError);
  await assert.rejects(readPdf(file, { limits: { maxPages: 501 } }), /1–500/);
});

test('JSON round trip owns its data and retains rich text, layout and embedded assets', () => {
  const store = new DocumentStore();
  const id = store.addElement('text', { content: paragraph('中文演示'), x: 96, rotation: 17 });
  store.addImageAsset(image);
  const snapshot = store.getDocument();
  snapshot.slides[0].elements[0].content.content[0].content[0].marks = [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#c03040', fontSize: '32pt' } }];
  const loaded = validateDocument(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(loaded, snapshot);
  assert.equal(loaded.slides[0].elements[0].id, id);
  assert.equal(store.getDocument().slides[0].elements[0].content.content[0].content[0].marks, undefined);
  const assetId = Object.keys(snapshot.assets)[0];
  snapshot.assets[assetId].data = 'changed by host';
  snapshot.assets[assetId].name = 'changed.png';
  assert.equal(store.getDocument().assets[assetId].data, png);
  assert.equal(store.getDocument().assets[assetId].name, 'pixel.png');
  store.addElement('shape');
  store.undo();
  assert.equal(store.getDocument().assets[assetId].data, png);
  store.redo();
  assert.equal(store.getDocument().assets[assetId].name, 'pixel.png');
});

test('invalid loads and mutations are atomic and retain usable undo history', () => {
  const store = new DocumentStore();
  const id = store.addElement('shape');
  const previous = store.getDocument();
  const invalid = store.getDocument();
  invalid.slides[0].elements.push({ ...invalid.slides[0].elements[0] });
  assert.throws(() => store.setDocument(invalid));
  assert.throws(() => store.updateElement(id, { width: NaN }));
  assert.deepEqual(store.getDocument(), previous);
  store.undo();
  assert.equal(store.slide.elements.length, 0);
  store.redo();
  assert.deepEqual(store.getDocument(), previous);
});

test('unsupported markup and missing image references fail at the document boundary', () => {
  const doc = createDocument();
  doc.slides[0].elements.push(createElement('text', { content: { type: 'doc', content: [{ type: 'script', text: 'alert(1)' }] } }));
  assert.throws(() => validateDocument(doc));
  doc.slides[0].elements = [createElement('image', { assetId: 'missing' })];
  assert.throws(() => validateDocument(doc));
  doc.schemaVersion = 2;
  assert.throws(() => validateDocument(doc));
});

test('pasted empty or unsupported font attributes cannot discard otherwise valid text', () => {
  const content = { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: '保留文字', marks: [{ type: 'textStyle', attrs: { fontFamily: '', fontSize: '', color: '#ff0000' } }] },
    { type: 'text', text: '默认字体', marks: [{ type: 'textStyle', attrs: { fontFamily: 'Fancy/Font', color: '' } }] },
  ] }] };
  const store = new DocumentStore();
  const id = store.addElement('text', { content: paragraph('原文') });
  store.updateElement(id, { content: normalizeText(content) });
  assert.equal(plainText(store.slide.elements[0].content), '保留文字默认字体');
  assert.equal(store.slide.elements[0].content.content[0].content[0].marks[0].attrs.color, '#ff0000');
  const saved = JSON.parse(JSON.stringify(store.getDocument()));
  store.undo();
  assert.equal(plainText(store.slide.elements[0].content), '原文');
  store.redo();
  assert.deepEqual(store.getDocument(), saved);
  store.setDocument(saved);
  assert.equal(plainText(store.slide.elements[0].content), '保留文字默认字体');
});

test('copying across documents retains images and assigns independent identities', () => {
  const source = new DocumentStore();
  const id = source.addImageAsset(image);
  source.selectElements([id]);
  const destination = new DocumentStore();
  destination.pasteSelection(source.copySelection());
  const pasted = destination.slide.elements[0];
  assert.notEqual(pasted.id, id);
  assert.notEqual(pasted.assetId, source.slide.elements[0].assetId);
  assert.equal(destination.doc.assets[pasted.assetId].data, png);
  assert.equal(pasted.x, source.slide.elements[0].x + 24);
  const duplicate = destination.duplicateSlide();
  assert.notEqual(destination.slide.elements[0].id, pasted.id);
  destination.deleteSlide(duplicate);
  destination.deleteSlide();
  assert.equal(destination.doc.slides.length, 1);
  assert.equal(destination.slide.elements.length, 0);
  destination.undo();
  assert.equal(destination.slide.elements.length, 1);
});

test('unused images leave saved documents while shared references, undo and clipboard retain them', () => {
  const store = new DocumentStore();
  const imageId = store.addImageAsset(image);
  const assetId = store.slide.elements[0].assetId;
  const firstSlide = store.slideId;
  store.selectElements([imageId]);
  const clipboard = store.copySelection();
  const secondSlide = store.duplicateSlide();
  store.goToSlide(firstSlide);
  store.deleteElements([imageId]);
  assert.equal(store.getDocument().assets[assetId].data, png);
  store.deleteSlide(secondSlide);
  assert.deepEqual(store.getDocument().assets, {});
  store.undo();
  assert.equal(store.getDocument().assets[assetId].data, png);
  store.redo();
  assert.deepEqual(store.getDocument().assets, {});
  store.undo();
  store.undo();
  assert.equal(store.slide.elements[0].assetId, assetId);
  store.redo();
  store.redo();
  const saved = JSON.parse(JSON.stringify(store.getDocument()));
  store.setDocument(saved);
  assert.deepEqual(store.getDocument().assets, {});
  store.pasteSelection(clipboard);
  assert.equal(Object.values(store.getDocument().assets)[0].data, png);
  assert.notEqual(store.slide.elements[0].assetId, assetId);

  const legacy = createDocument();
  legacy.assets.orphan = image;
  store.setDocument(legacy);
  assert.deepEqual(store.getDocument().assets, {});
  assert.equal(legacy.assets.orphan.data, png);
});

test('continuous typing coalesces while formatting, gestures and redo retain boundaries', () => {
  const store = new DocumentStore();
  const id = store.addElement('text', { content: paragraph('') });
  store.updateElement(id, { content: paragraph('你') }, 'typing');
  store.updateElement(id, { content: paragraph('你好') }, 'typing');
  store.updateElement(id, { x: 250, y: 300, width: 410, rotation: 23 });
  store.undo();
  assert.equal(store.slide.elements[0].x, 120);
  assert.equal(store.slide.elements[0].content.content[0].content[0].text, '你好');
  store.undo();
  assert.deepEqual(store.slide.elements[0].content, paragraph(''));
  store.redo();
  store.redo();
  assert.equal(store.slide.elements[0].rotation, 23);
  store.undo();
  store.updateElement(id, { y: 99 });
  assert.equal(store.history.future.length, 0);
});

test('view mode and element locks protect mutations', () => {
  const store = new DocumentStore();
  const id = store.addElement('shape', { locked: true });
  store.updateElement(id, { x: 600 });
  store.deleteElements([id]);
  assert.equal(store.slide.elements[0].x, 120);
  assert.equal(store.slide.elements.length, 1);
  store.setMode('view');
  assert.throws(() => store.addSlide());
  assert.throws(() => store.undo());
  store.setDocument(createDocument('加载只读文稿'));
  assert.equal(store.doc.title, '加载只读文稿');
});

test('alignment and distribution use rotated visual bounds, excluding locked objects', () => {
  const left = createElement('shape', { x: 100, y: 60, width: 80, height: 40, rotation: 90 });
  const right = createElement('shape', { x: 400, y: 100, width: 80, height: 40 });
  const middle = createElement('shape', { x: 280, y: 160, width: 20, height: 20 });
  const locked = createElement('shape', { x: -1000, locked: true });
  const changes = alignElements([left, right, locked], 'left', { width: 1280, height: 720 });
  const aligned = [left, right].map(element => ({ ...element, ...changes.find(update => update.id === element.id).patch }));
  assert.ok(Math.abs(boundingBox([aligned[0]]).x - boundingBox([aligned[1]]).x) < 0.001);
  const distribution = distributeElements([left, middle, right, locked], 'x');
  const boxes = [left, middle, right].map(element => boundingBox([{ ...element, ...distribution.find(update => update.id === element.id).patch }]));
  assert.ok(Math.abs((boxes[1].x - boxes[0].x - boxes[0].width) - (boxes[2].x - boxes[1].x - boxes[1].width)) < 0.001);
});

test('PowerPoint contains editable text runs, native shapes, geometry and embedded pictures', async () => {
  const store = new DocumentStore(createDocument('SlideKit 导出验收'));
  store.addElement('text', {
    x: 96, y: 96, width: 650, height: 240, content: {
      type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center', lineHeight: '1.5' }, content: [
        { type: 'text', text: '可以继续编辑的', marks: [{ type: 'bold' }] },
        { type: 'text', text: '中文标题', marks: [{ type: 'textStyle', attrs: { fontSize: '36pt', color: '#c03040' } }] },
      ] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '原生列表' }] }] }] }],
    },
  });
  store.addElement('shape', { shape: 'roundRect', x: 96, y: 400, width: 300, height: 160, rotation: 15 });
  store.addElement('shape', { shape: 'arrow', x: 450, y: 430, width: 250, height: 20, strokeWidth: 3 });
  store.addImageAsset(image, { x: 820, y: 180, width: 200, height: 200, fit: 'cover' });
  const before = store.getDocument();
  const blob = await exportPptx(before);
  const bytes = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('ppt/slides/slide1.xml').async('string');
  assert.match(xml, /可以继续编辑的/);
  assert.match(xml, /中文标题/);
  assert.match(xml, /C03040/);
  assert.match(xml, /sz="3600"/);
  assert.match(xml, /<a:buChar/);
  assert.match(xml, /prst="roundRect"/);
  assert.match(xml, /rot="900000"/);
  assert.match(xml, /<p:pic>/);
  assert.match(xml, /x="914400"/);
  assert.ok(Object.keys(zip.files).some(name => name.startsWith('ppt/media/') && name.endsWith('.png')));
  assert.deepEqual(before, store.getDocument());
  if (process.env.SLIDEKIT_PPTX_OUTPUT) await writeFile(process.env.SLIDEKIT_PPTX_OUTPUT, new Uint8Array(bytes));
});

test('PPTX export/import retains editable objects, rich text, geometry and image bytes', async () => {
  const store = new DocumentStore(createDocument('PPTX 往返'));
  store.addElement('text', { x: 96, y: 96, width: 500, height: 180, content: {
    type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [
      { type: 'text', text: '可编辑中文', marks: [{ type: 'bold' }, { type: 'underline' }, { type: 'textStyle', attrs: { color: '#cc3344', fontSize: '32pt' } }] },
    ] }],
  } });
  store.addElement('shape', { shape: 'ellipse', x: 120, y: 300, width: 200, height: 150, rotation: 25, fill: '#334455' });
  store.addImageAsset(image, { x: 600, y: 150, width: 100, height: 100, fit: 'contain' });
  store.addSlide({ name: '第二页', background: '#aabbcc' });
  store.addElement('shape', { shape: 'arrow', x: 40, y: 50, width: 230, height: 20, stroke: '#112233' });
  const result = await readPptx(await exportPptx(store.getDocument()));
  assert.equal(result.document.slides.length, 2);
  assert.equal(result.document.slides[1].background, '#aabbcc');
  const first = result.document.slides[0].elements;
  const text = first.find(element => element.type === 'text');
  assert.equal(plainText(text.content), '可编辑中文');
  assert.equal(text.x, 96);
  assert.equal(text.width, 500);
  assert.equal(text.content.content[0].attrs.textAlign, 'center');
  const marks = text.content.content[0].content[0].marks;
  assert.ok(marks.some(mark => mark.type === 'bold'));
  assert.ok(marks.some(mark => mark.type === 'underline'));
  assert.equal(marks.find(mark => mark.type === 'textStyle').attrs.color, '#cc3344');
  const shape = first.find(element => element.type === 'shape');
  assert.equal(shape.shape, 'ellipse');
  assert.ok(Math.abs(shape.rotation - 25) < 0.001);
  assert.equal(shape.fill, '#334455');
  const picture = first.find(element => element.type === 'image');
  assert.equal(result.document.assets[picture.assetId].data, png);
  assert.equal(result.document.slides[1].elements[0].shape, 'arrow');
  const imported = new DocumentStore(result.document);
  imported.updateElement(text.id, { content: paragraph('导入后修改') });
  imported.undo();
  assert.equal(plainText(imported.slide.elements.find(element => element.id === text.id).content), '可编辑中文');
});

test('PPTX uses relationship order, layout placeholders, theme colors and group coordinates', async () => {
  const store = new DocumentStore();
  store.addSlide();
  const zip = await JSZip.loadAsync(await (await exportPptx(store.getDocument())).arrayBuffer());
  const original = await zip.file('ppt/slides/slide1.xml').async('string');
  const placeholder = '<p:sp><p:nvSpPr><p:cNvPr id="10" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title" idx="2"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr lIns="0" rIns="0" tIns="0" bIns="0"/><a:lstStyle/><a:p><a:r><a:t>母版标题</a:t></a:r></a:p></p:txBody></p:sp>';
  const grouped = '<p:grpSp><p:nvGrpSpPr/><p:grpSpPr><a:xfrm><a:off x="952500" y="1905000"/><a:ext cx="1905000" cy="952500"/><a:chOff x="0" y="0"/><a:chExt cx="952500" cy="476250"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr/><p:spPr><a:xfrm><a:off x="95250" y="95250"/><a:ext cx="190500" cy="95250"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp></p:grpSp>';
  zip.file('ppt/slides/slide1.xml', original.replace('</p:spTree>', placeholder + grouped + '</p:spTree>'));
  const layout = await zip.file('ppt/slideLayouts/slideLayout1.xml').async('string');
  const layoutShape = placeholder.replace('<p:spPr/>', '<p:spPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="4762500" cy="762000"/></a:xfrm></p:spPr>').replace('<a:lstStyle/>', '<a:lstStyle><a:lvl1pPr><a:defRPr sz="3600"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>');
  zip.file('ppt/slideLayouts/slideLayout1.xml', layout.replace('</p:spTree>', layoutShape + '</p:spTree>'));
  const presentation = await zip.file('ppt/presentation.xml').async('string');
  zip.file('ppt/presentation.xml', presentation.replace(/(<p:sldId [^>]+\/>)(<p:sldId [^>]+\/>)/, '$2$1'));
  const result = await readPptx(new Blob([await zip.generateAsync({ type: 'uint8array' })]));
  assert.equal(result.document.slides[0].elements.length, 0);
  const [text, shape] = result.document.slides[1].elements;
  assert.equal(plainText(text.content), '母版标题');
  assert.equal(text.x, 96);
  assert.equal(text.y, 48);
  assert.equal(text.fontSize, 36);
  assert.equal(shape.x, 120);
  assert.equal(shape.y, 220);
  assert.equal(shape.width, 40);
  assert.equal(shape.height, 20);
  assert.equal(text.color, shape.fill);
});

test('PPTX rejects damaged packages, external slide references and cancellation', async () => {
  const store = new DocumentStore(createDocument('保留原稿'));
  const original = store.getDocument();
  await assert.rejects(readPptx(new Blob(['not a pptx'])), /不是有效的 PPTX/);
  await assert.rejects(readPptx(new Blob(['PKbad']), { signal: AbortSignal.abort() }), { name: 'AbortError' });
  const bytes = await (await exportPptx(original)).arrayBuffer();
  const controller = new AbortController();
  await assert.rejects(readPptx(new Blob([bytes]), { signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' });
  const broken = await JSZip.loadAsync(bytes);
  broken.remove('ppt/slides/slide1.xml');
  await assert.rejects(readPptx(new Blob([await broken.generateAsync({ type: 'uint8array' })])), /缺少资源/);
  const external = await JSZip.loadAsync(bytes);
  const relationships = await external.file('ppt/_rels/presentation.xml.rels').async('string');
  external.file('ppt/_rels/presentation.xml.rels', relationships.replace('Target="slides/slide1.xml"', 'Target="https://example.com/slide.xml" TargetMode="External"'));
  await assert.rejects(readPptx(new Blob([await external.generateAsync({ type: 'uint8array' })])), /页面引用无效/);
});

test('PPTX reports unsupported content while retaining supported editable text', async () => {
  const store = new DocumentStore();
  store.addElement('text', { content: paragraph('保留的文字') });
  const zip = await JSZip.loadAsync(await (await exportPptx(store.getDocument())).arrayBuffer());
  const slide = await zip.file('ppt/slides/slide1.xml').async('string');
  const chart = '<p:graphicFrame><p:nvGraphicFramePr/><p:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="1000000"/></p:xfrm><a:graphic/></p:graphicFrame>';
  zip.file('ppt/slides/slide1.xml', slide.replace('</p:spTree>', chart + '</p:spTree>'));
  const result = await readPptx(new Blob([await zip.generateAsync({ type: 'uint8array' })]));
  assert.equal(plainText(result.document.slides[0].elements.find(element => element.type === 'text').content), '保留的文字');
  assert.equal(result.warnings.length, 1);
});

test('PPTX opens remaining content when a picture reference is empty, broken or external', async () => {
  const store = new DocumentStore();
  store.addElement('text', { content: paragraph('图片缺失时仍保留文字') });
  store.addImageAsset(image);
  const zip = await JSZip.loadAsync(await (await exportPptx(store.getDocument())).arrayBuffer());
  const path = 'ppt/slides/slide1.xml';
  const xml = await zip.file(path).async('string');
  const picture = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/)[0];
  const empty = picture.replace(/r:embed="[^"]*"/, '').replace(/name="[^"]*"/, 'name="空图片占位符"');
  const broken = picture.replace(/r:embed="[^"]*"/, 'r:embed="missingPicture"').replace(/name="[^"]*"/, 'name="损坏的图片引用"');
  const absent = picture.replace(/r:embed="[^"]*"/, 'r:embed="missingFile"').replace(/name="[^"]*"/, 'name="缺少媒体文件"');
  const linked = picture.replace(/r:embed="[^"]*"/, 'r:link="externalImage"').replace(/name="[^"]*"/, 'name="链接图片"');
  zip.file(path, xml.replace('</p:spTree>', empty + broken + absent + linked + '</p:spTree>'));
  const relPath = 'ppt/slides/_rels/slide1.xml.rels';
  const rels = await zip.file(relPath).async('string');
  zip.file(relPath, rels.replace('</Relationships>', '<Relationship Id="missingFile" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/not-there.png"/><Relationship Id="externalImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/image.png" TargetMode="External"/></Relationships>'));
  const result = await readPptx(new Blob([await zip.generateAsync({ type: 'uint8array' })]));
  assert.equal(plainText(result.document.slides[0].elements.find(element => element.type === 'text').content), '图片缺失时仍保留文字');
  assert.equal(result.document.slides[0].elements.filter(element => element.type === 'image').length, 1);
  assert.equal(Object.values(result.document.assets)[0].data, png);
  assert.equal(result.warnings.length, 4);
});

test('PPTX resolves picture compatibility branches in their own relationship scope', async () => {
  const store = new DocumentStore();
  store.addImageAsset(image);
  const zip = await JSZip.loadAsync(await (await exportPptx(store.getDocument())).arrayBuffer());
  const path = 'ppt/slides/slide1.xml';
  let xml = await zip.file(path).async('string');
  const fill = xml.match(/<p:blipFill[\s\S]*?<\/p:blipFill>/)[0];
  const blip = fill.match(/<a:blip\b[^>]*(?:\/>|>[\s\S]*?<\/a:blip>)/)[0];
  const missing = blip.replace(/r:embed="[^"]*"/, 'r:embed="missingModernFormat"');
  const alternatives = '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="a">' + missing + '</mc:Choice><mc:Fallback>' + blip + '</mc:Fallback></mc:AlternateContent>';
  xml = xml.replace(blip, alternatives);
  const outerFill = xml.match(/<p:blipFill[\s\S]*?<\/p:blipFill>/)[0];
  xml = xml.replace(outerFill, '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="a"><p:blipFill>' + missing + '</p:blipFill></mc:Choice><mc:Fallback>' + outerFill + '</mc:Fallback></mc:AlternateContent>');
  zip.file(path, xml);
  const result = await readPptx(new Blob([await zip.generateAsync({ type: 'uint8array' })]));
  assert.equal(result.document.slides[0].elements.length, 1);
  const imported = result.document.slides[0].elements[0];
  assert.equal(imported.type, 'image');
  assert.equal(result.document.assets[imported.assetId].data, png);
  assert.equal(result.warnings.length, 0);
});

test('PPTX resolves SVG-only Office pictures and keeps available raster fallbacks', () => {
  const relationships = new Map([
    ['rSvg', { type: 'image', path: 'ppt/media/icon.svg', external: false }],
    ['rRaster', { type: 'image', path: 'ppt/media/icon.png', external: false }],
  ]);
  const parts = new Set(['ppt/media/icon.svg', 'ppt/media/icon.png']);
  for (const [reference, expected] of [['', 'svg'], ['r:embed="missing"', 'svg'], ['r:embed="rRaster"', 'png']]) {
    const fill = new DOMParser().parseFromString(
      '<p:blipFill xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<a:blip ' + reference + '><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rSvg"/></a:ext></a:extLst></a:blip></p:blipFill>',
      'application/xml',
    ).documentElement;
    const selected = resolvePicture([fill], relationships, path => parts.has(path));
    assert.equal(selected.path, 'ppt/media/icon.' + expected);
    assert.equal(selected.type, expected);
    assert.equal(selected.problem, undefined);
  }
});

test('gradient direction uses logical dimensions and compensates fixed paint for rotation', () => {
  const gradient = { angle: 45, scaled: true, rotateWithShape: true };
  const wide = gradientVector(gradient, 400, 100);
  assert.ok(Math.abs(wide.x / wide.y - 4) < 0.00001);
  const resized = gradientVector(gradient, 800, 200);
  assert.deepEqual(resized, wide);
  const unscaled = gradientVector({ ...gradient, scaled: false }, 400, 100);
  assert.ok(Math.abs(unscaled.x - unscaled.y) < 0.00001);
  const fixed = gradientVector({ ...gradient, angle: 0, rotateWithShape: false }, 400, 100, 90);
  assert.ok(Math.abs(fixed.x) < 0.00001);
  assert.equal(fixed.y, -1);
});

test('JSON, history and native PPTX retain gradients, outer shadows and both kinds of arrows', async () => {
  const gradient = { type: 'linear', angle: 35, scaled: true, rotateWithShape: true, stops: [
    { offset: 0, color: '#6136ff', opacity: 1 }, { offset: 0.53, color: '#cb2ae3', opacity: 0.4 }, { offset: 1, color: '#ff763d', opacity: 1 },
  ] };
  const shadow = { color: '#000000', opacity: 0.1, blur: 0, offsetX: 0, offsetY: 0, rotateWithShape: true };
  const store = new DocumentStore();
  store.updateSlide(store.slideId, { backgroundGradient: gradient });
  const id = store.addElement('shape', { shape: 'rightArrow', gradient, shadow, arrowShaft: 0.35, arrowHead: 0.7, rotation: 25 });
  store.addElement('shape', { shape: 'leftRightArrow', gradient, shadow: { ...shadow, blur: 20, offsetX: -4, offsetY: 4 } });
  store.addElement('shape', { shape: 'arrow', startArrow: 'diamond', endArrow: 'stealth', width: 300, height: 12, rotation: 30 });
  store.addElement('text', { content: { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: '渐变中文', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { gradient } }] },
    { type: 'hardBreak' }, { type: 'text', text: '普通文字' },
    { type: 'text', text: '渐变\n换行', marks: [{ type: 'textStyle', attrs: { gradient } }] },
  ] }] } });
  const snapshot = validateDocument(JSON.parse(JSON.stringify(store.getDocument())));
  store.updateElement(id, { gradient: { ...gradient, angle: 90 } });
  store.undo();
  assert.deepEqual(store.getDocument(), snapshot);
  const invalid = structuredClone(snapshot);
  invalid.slides[0].elements[0].gradient.stops[0].opacity = NaN;
  assert.throws(() => store.setDocument(invalid));
  assert.deepEqual(store.getDocument(), snapshot);
  const invalidTextFill = structuredClone(snapshot);
  invalidTextFill.slides[0].elements[3].gradient = gradient;
  assert.throws(() => store.setDocument(invalidTextFill));
  const file = await exportPptx(snapshot);
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file('ppt/slides/slide1.xml').async('string');
  assert.match(xml, /<a:gradFill/);
  assert.match(xml, /<a:outerShdw[^>]*blurRad="0"[^>]*dist="0"/);
  assert.match(xml, /prst="rightArrow"/);
  assert.match(xml, /<a:headEnd type="diamond"/);
  assert.match(xml, /<a:tailEnd type="stealth"/);
  assert.equal(Object.keys(zip.files).filter(name => /^ppt\/media\/.+/.test(name)).length, 0);
  const imported = await readPptx(file);
  assert.equal(imported.warnings.length, 0);
  const [arrow, double, connector, text] = imported.document.slides[0].elements;
  assert.deepEqual(imported.document.slides[0].backgroundGradient, gradient);
  assert.deepEqual(arrow.gradient, gradient);
  assert.deepEqual(arrow.shadow, shadow);
  assert.equal(arrow.arrowShaft, 0.35);
  assert.equal(arrow.arrowHead, 0.7);
  assert.equal(double.shape, 'leftRightArrow');
  assert.ok(Math.abs(double.shadow.offsetX + 4) < 0.001);
  assert.ok(Math.abs(double.shadow.offsetY - 4) < 0.001);
  assert.equal(connector.startArrow, 'diamond');
  assert.equal(connector.endArrow, 'stealth');
  assert.ok(Math.abs(connector.rotation - 30) < 0.001);
  const marks = text.content.content[0].content[0].marks;
  assert.deepEqual(marks.find(mark => mark.type === 'textStyle').attrs.gradient, gradient);
  if (process.env.SLIDEKIT_APPEARANCE_OUTPUT) await writeFile(process.env.SLIDEKIT_APPEARANCE_OUTPUT, new Uint8Array(await file.arrayBuffer()));
});

test('Office shadow preset colors and empty effect lists do not lose opacity or produce false warnings', async () => {
  const store = new DocumentStore();
  store.addElement('shape', { shape: 'roundRect' });
  store.addElement('shape', { shape: 'rect' });
  const zip = await JSZip.loadAsync(await (await exportPptx(store.getDocument())).arrayBuffer());
  const path = 'ppt/slides/slide1.xml';
  let first = true;
  zip.file(path, (await zip.file(path).async('string')).replace(/<\/p:spPr>/g, () => {
    const effect = first ? '<a:outerShdw blurRad="203200" dist="38100" dir="2700000" algn="tl" rotWithShape="0"><a:prstClr val="black"><a:alpha val="10000"/></a:prstClr></a:outerShdw>' : '';
    first = false;
    return '<a:effectLst>' + effect + '</a:effectLst></p:spPr>';
  }));
  const result = await readPptx(new Blob([await zip.generateAsync({ type: 'uint8array' })]));
  assert.equal(result.warnings.length, 0);
  const shadow = result.document.slides[0].elements[0].shadow;
  assert.equal(shadow.color, '#000000');
  assert.equal(shadow.opacity, 0.1);
  assert.equal(shadow.rotateWithShape, false);
  assert.ok(Math.abs(shadow.blur - 21.333333) < 0.00001);
  assert.ok(Math.abs(shadow.offsetX - Math.sqrt(8)) < 0.00001);
  assert.equal(result.document.slides[0].elements[1].shadow, undefined);
});

test('PPTX keeps leading, repeated and trailing breaks with correctly matched gradient runs', async () => {
  const gradient = { type: 'linear', angle: 0, scaled: true, rotateWithShape: true, stops: [
    { offset: 0, color: '#ff0000', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: 1 },
  ] };
  const text = value => ({ type: 'text', text: value, marks: [{ type: 'textStyle', attrs: { gradient } }] });
  const br = { type: 'hardBreak' };
  const cases = [
    [[br, text('第二行')], '\n第二行'],
    [[br, br, text('第三行'), br], '\n\n第三行\n'],
    [[text('文字\n')], '文字\n'],
    [[text('\n')], '\n'],
    [[text('前\r\n中\r后\n'), text('尾')], '前\n中\n后\n尾'],
    [[text('渐变\n'), { type: 'text', text: '纯色', marks: [{ type: 'textStyle', attrs: { color: '#00ff00' } }] }], '渐变\n纯色'],
  ];
  const doc = createDocument();
  doc.slides[0].elements = cases.map(([content]) => createElement('text', { content: { type: 'doc', content: [{ type: 'paragraph', content }] } }));
  const file = await exportPptx(doc);
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'application/xml');
  const firstParagraph = at(xml.documentElement, 'cSld/spTree/sp/txBody/p');
  assert.equal(children(firstParagraph).filter(node => ['br', 'r'].includes(node.localName))[0].localName, 'br');
  let imported = await readPptx(file);
  for (let pass = 0; pass < 2; pass++) {
    assert.equal(imported.document.slides[0].elements.length, cases.length);
    imported.document.slides[0].elements.forEach((element, index) => assert.equal(plainText(element.content), cases[index][1]));
    const mixed = imported.document.slides[0].elements.at(-1).content.content[0].content;
    assert.deepEqual(mixed[0].marks.find(mark => mark.type === 'textStyle').attrs.gradient, gradient);
    assert.equal(mixed.at(-1).marks.find(mark => mark.type === 'textStyle').attrs.color, '#00ff00');
    imported = await readPptx(await exportPptx(imported.document));
  }
});

test('PPTX retains uniform and mixed text alpha through repeated editable round trips', async () => {
  const doc = createDocument();
  doc.slides[0].elements = [0.2, 0, 1].map(opacity => createElement('text', { opacity, content: paragraph('透明度') }));
  doc.slides[0].elements.push(createElement('text', { opacity: 0.5, content: { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: '局部', marks: [{ type: 'textStyle', attrs: { color: '#ff0000', opacity: 0.4 } }] },
    { type: 'text', text: '其余' },
  ] }] } }));
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))), doc);
  const invalid = structuredClone(doc);
  invalid.slides[0].elements[3].content.content[0].content[0].marks[0].attrs.opacity = -0.2;
  assert.throws(() => validateDocument(invalid));
  let input = doc;
  for (let pass = 0; pass < 2; pass++) {
    const result = await readPptx(await exportPptx(input));
    assert.deepEqual(result.warnings, []);
    const [partial, invisible, opaque, mixed] = result.document.slides[0].elements;
    assert.equal(partial.opacity, 0.2);
    assert.equal(invisible.opacity, 0);
    assert.equal(opaque.opacity, 1);
    const runs = mixed.content.content[0].content;
    assert.equal(mixed.opacity * (runs[0].marks.find(mark => mark.type === 'textStyle').attrs.opacity ?? 1), 0.2);
    assert.equal(mixed.opacity * (runs[1].marks.find(mark => mark.type === 'textStyle').attrs.opacity ?? 1), 0.5);
    input = result.document;
  }
});

test('Office elbow connectors retain bends, mirroring and editable native paths', async () => {
  const store = new DocumentStore();
  for (let index = 0; index < 5; index++) store.addElement('shape', { shape: 'arrow', width: 320, height: 160, rotation: 30, fill: 'transparent', opacity: 0.4, startArrow: 'diamond', endArrow: 'stealth' });
  const zip = await JSZip.loadAsync(await (await exportPptx(store.getDocument())).arrayBuffer());
  const path = 'ppt/slides/slide1.xml';
  const xml = new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml');
  const shapes = children(at(xml.documentElement, 'cSld/spTree'), 'sp');
  const presets = ['bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5', 'curvedConnector3'];
  shapes.forEach((node, index) => {
    at(node, 'spPr/xfrm/ext').setAttribute('cy', '1524000');
    at(node, 'spPr/xfrm').setAttribute('flipV', '1');
    const geometry = at(node, 'spPr/prstGeom');
    geometry.setAttribute('prst', presets[index]);
    for (const [name, value] of [['adj1', 25000], ['adj2', 60000], ['adj3', 75000]]) {
      const guide = xml.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:gd');
      guide.setAttribute('name', name); guide.setAttribute('fmla', 'val ' + value);
      at(geometry, 'avLst').appendChild(guide);
    }
  });
  zip.file(path, new XMLSerializer().serializeToString(xml).replaceAll('<p:sp>', '<p:cxnSp>').replaceAll('</p:sp>', '</p:cxnSp>').replaceAll('p:nvSpPr', 'p:nvCxnSpPr').replaceAll('p:cNvSpPr', 'p:cNvCxnSpPr'));
  const imported = await readPptx(new Blob([await zip.generateAsync({ type: 'uint8array' })]));
  assert.equal(imported.warnings.length, 1);
  const elements = imported.document.slides[0].elements;
  assert.deepEqual(elements.slice(0, 4).map(element => element.points.length), [3, 4, 5, 6]);
  const expected = [{ x: 0, y: 1 }, { x: 0.25, y: 1 }, { x: 0.25, y: 0 }, { x: 1, y: 0 }];
  elements[1].points.forEach((point, index) => {
    assert.ok(Math.abs(point.x - expected[index].x) < 0.000001);
    assert.ok(Math.abs(point.y - expected[index].y) < 0.000001);
  });
  const loaded = new DocumentStore(JSON.parse(JSON.stringify(imported.document)));
  loaded.updateElement(elements[1].id, { width: 640, rotation: 70 });
  assert.deepEqual(loaded.slide.elements[1].points, elements[1].points);
  loaded.undo();
  const exported = await exportPptx(loaded.getDocument());
  const native = await JSZip.loadAsync(await exported.arrayBuffer());
  const nativeXml = new DOMParser().parseFromString(await native.file(path).async('string'), 'application/xml');
  const custom = children(at(nativeXml.documentElement, 'cSld/spTree'), 'sp').filter(node => at(node, 'spPr/custGeom'));
  assert.equal(custom.length, 4);
  assert.equal(children(at(custom[1], 'spPr/custGeom/pathLst/path'), 'lnTo').length, 3);
  const roundtrip = await readPptx(exported);
  assert.deepEqual(roundtrip.warnings, []);
  roundtrip.document.slides[0].elements.slice(0, 4).forEach((element, index) => {
    assert.ok(Math.abs(element.rotation - 30) < 0.000001);
    assert.equal(element.startArrow, 'diamond');
    assert.equal(element.endArrow, 'stealth');
    assert.equal(element.opacity, 0.4);
    element.points.forEach((point, pointIndex) => {
      assert.ok(Math.abs(point.x - elements[index].points[pointIndex].x) < 0.000001);
      assert.ok(Math.abs(point.y - elements[index].points[pointIndex].y) < 0.000001);
    });
  });
});

test('transparent shape fills retain independently visible outlines across PPTX round trips', async () => {
  let doc = createDocument();
  doc.slides[0].elements = [1, 0.4, 0].map(opacity => createElement('shape', {
    fill: 'transparent', stroke: '#ef4444', strokeWidth: 5, opacity,
  }));
  for (let pass = 0; pass < 3; pass++) {
    const result = await readPptx(await exportPptx(doc));
    assert.deepEqual(result.warnings, []);
    result.document.slides[0].elements.forEach((element, index) => {
      assert.equal(element.fill, 'transparent');
      assert.equal(element.stroke, '#ef4444');
      assert.equal(element.strokeWidth, 5);
      assert.equal(element.opacity, [1, 0.4, 0][index]);
    });
    doc = result.document;
  }
  const zip = await JSZip.loadAsync(await (await exportPptx(doc)).arrayBuffer());
  const path = 'ppt/slides/slide1.xml';
  const xml = new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml');
  for (const shape of children(at(xml.documentElement, 'cSld/spTree'), 'sp')) {
    const properties = at(shape, 'spPr');
    properties.replaceChild(xml.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:noFill'), at(properties, 'solidFill'));
  }
  zip.file(path, new XMLSerializer().serializeToString(xml));
  const native = await readPptx(new Blob([await zip.generateAsync({ type: 'uint8array' })]));
  assert.deepEqual(native.document.slides[0].elements.map(element => element.opacity), [1, 0.4, 0]);
});

test('shadow alpha does not compound on translucent shapes, text, gradients or pictures', async () => {
  let doc = createDocument();
  const shadow = { color: '#000000', opacity: 0.4, blur: 12, offsetX: 30, offsetY: 30, rotateWithShape: false };
  const gradient = { type: 'linear', angle: 0, scaled: true, rotateWithShape: true, stops: [
    { offset: 0, color: '#ff0000', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: 0.4 },
  ] };
  doc.assets.pixel = image;
  doc.slides[0].elements = [
    createElement('shape', { opacity: 0.5, shadow }),
    createElement('text', { opacity: 0.25, shadow, content: paragraph('阴影文字') }),
    createElement('image', { opacity: 0.3, shadow, assetId: 'pixel', width: 100, height: 100, fit: 'cover' }),
    createElement('shape', { opacity: 0.5, shadow, gradient }),
    createElement('shape', { opacity: 0, shadow }),
  ];
  for (let pass = 0; pass < 3; pass++) {
    const file = await exportPptx(doc);
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'application/xml');
    const effects = [...xml.getElementsByTagName('a:outerShdw')];
    assert.equal(effects.length, 5);
    effects.forEach(effect => assert.equal(at(effect, 'srgbClr/alpha').getAttribute('val'), '40000'));
    const result = await readPptx(file);
    assert.deepEqual(result.warnings, []);
    result.document.slides[0].elements.forEach(element => assert.equal(element.shadow.opacity, 0.4));
    assert.deepEqual(result.document.slides[0].elements.map(element => element.opacity), [0.5, 0.25, 0.3, 0.5, 0]);
    doc = result.document;
  }
});

test('hidden PPTX objects and groups are skipped before importing their content or resources', async () => {
  const doc = createDocument();
  doc.assets.pixel = image;
  doc.slides[0].elements = [
    createElement('text', { content: paragraph('可见文字') }),
    createElement('text', { content: paragraph('隐藏文字') }),
    createElement('shape'),
    createElement('shape', { shape: 'arrow' }),
    createElement('image', { assetId: 'pixel', width: 100, height: 100 }),
  ];
  const zip = await JSZip.loadAsync(await (await exportPptx(doc)).arrayBuffer());
  const path = 'ppt/slides/slide1.xml';
  const xml = new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml');
  const shapes = children(at(xml.documentElement, 'cSld/spTree'), 'sp');
  at(shapes[1], 'nvSpPr/cNvPr').setAttribute('hidden', '1');
  at(shapes[2], 'nvSpPr/cNvPr').setAttribute('hidden', 'true');
  at(shapes[3], 'nvSpPr/cNvPr').setAttribute('hidden', 'false');
  at(xml.documentElement, 'cSld/spTree/pic/nvPicPr/cNvPr').setAttribute('hidden', '1');
  // A hidden broken picture must not stop the import or read its media.
  at(xml.documentElement, 'cSld/spTree/pic/blipFill/blip').setAttribute('r:embed', 'missingImage');
  const group = '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="99" name="隐藏组合" hidden="1"/></p:nvGrpSpPr><p:grpSpPr/>' + new XMLSerializer().serializeToString(shapes[0]) + '</p:grpSp>';
  zip.file(path, new XMLSerializer().serializeToString(xml).replace('</p:spTree>', group + '</p:spTree>'));
  for (const [part, name] of [['ppt/slideMasters/slideMaster1.xml', '隐藏母版对象'], ['ppt/slideLayouts/slideLayout1.xml', '隐藏布局对象']]) {
    const inherited = shapes[2].cloneNode(true);
    at(inherited, 'nvSpPr/cNvPr').setAttribute('name', name);
    zip.file(part, (await zip.file(part).async('string')).replace('</p:spTree>', new XMLSerializer().serializeToString(inherited) + '</p:spTree>'));
  }
  const result = await readPptx(new Blob([await zip.generateAsync({ type: 'uint8array' })]));
  assert.equal(result.document.slides[0].elements.length, 2);
  assert.equal(plainText(result.document.slides[0].elements[0].content), '可见文字');
  assert.equal(result.document.slides[0].elements[1].shape, 'arrow');
  assert.deepEqual(result.document.assets, {});
  assert.equal(result.warnings.length, 6);
  const roundtrip = await readPptx(await exportPptx(result.document));
  assert.equal(roundtrip.document.slides[0].elements.length, 2);
  assert.deepEqual(roundtrip.warnings, []);
});

test('pasted list starts normalize without losing text through save and history', () => {
  for (const [start, expected] of [[0, 1], [-5, 1], [12000, 9999], [4, 4]]) {
    const store = new DocumentStore();
    const id = store.addElement('text', { content: paragraph('原文') });
    const content = { type: 'doc', content: [{ type: 'orderedList', attrs: { start }, content: [
      { type: 'listItem', content: paragraph('第一项').content },
      { type: 'listItem', content: paragraph('第二项').content },
    ] }] };
    store.updateElement(id, { content: normalizeText(content) });
    const saved = JSON.parse(JSON.stringify(store.getDocument()));
    assert.equal(saved.slides[0].elements[0].content.content[0].attrs.start, expected);
    assert.equal(plainText(saved.slides[0].elements[0].content), '第一项第二项');
    store.undo();
    assert.equal(plainText(store.slide.elements[0].content), '原文');
    store.redo();
    assert.deepEqual(store.getDocument(), saved);
    store.setDocument(saved);
    assert.equal(plainText(store.slide.elements[0].content), '第一项第二项');
  }
});

test('failed text commits preserve the editing draft until it can be recovered', () => {
  const store = new DocumentStore();
  const id = store.addElement('text', { content: paragraph('已保存的文字') });
  let draft = { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: '尚未保存的文字' }] }] };
  let destroyed = false;
  const errors = [];
  const owner = { store, report: error => errors.push(error), renderCanvas() {}, toolbar: { updateText() {} } };
  const session = new RichTextSession(owner);
  const editor = { getJSON: () => draft, destroy: () => { destroyed = true; } };
  session.editor = editor;
  session.id = id;
  assert.equal(session.flush(), false);
  assert.equal(errors.length, 1);
  assert.throws(() => session.stop(), /不支持的富文本节点/);
  assert.equal(session.editor, editor);
  assert.equal(destroyed, false);
  assert.equal(plainText(store.slide.elements[0].content), '已保存的文字');
  draft = paragraph('已恢复的文字');
  session.stop();
  assert.equal(destroyed, true);
  assert.equal(plainText(store.slide.elements[0].content), '已恢复的文字');
});

test('hidden slides retain content and visibility through JSON, history and PPTX', async () => {
  const store = new DocumentStore();
  store.addElement('text', { content: paragraph('可见页') });
  const hiddenId = store.addSlide({ hidden: true });
  store.addElement('text', { content: paragraph('隐藏的备份内容') });
  store.updateSlide(hiddenId, { hidden: false });
  store.undo();
  assert.equal(store.slide.hidden, true);
  store.redo();
  assert.equal(store.slide.hidden, false);
  store.updateSlide(hiddenId, { hidden: true });
  const saved = JSON.parse(JSON.stringify(store.getDocument()));
  store.setDocument(saved);
  assert.deepEqual(store.getDocument(), saved);
  const invalid = structuredClone(saved);
  invalid.slides[1].hidden = 'true';
  assert.throws(() => store.setDocument(invalid), /页面隐藏状态/);
  let doc = saved;
  for (let pass = 0; pass < 3; pass++) {
    const blob = await exportPptx(doc);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide2.xml').async('string'), 'application/xml');
    assert.equal(xml.documentElement.getAttribute('show'), '0');
    if (pass === 1) {
      xml.documentElement.setAttribute('show', 'false');
      zip.file('ppt/slides/slide2.xml', new XMLSerializer().serializeToString(xml));
    }
    const result = await readPptx(new Blob([await zip.generateAsync({ type: 'uint8array' })]));
    assert.equal(result.document.slides.length, 2);
    assert.equal(result.document.slides[0].hidden, undefined);
    assert.equal(result.document.slides[1].hidden, true);
    assert.equal(plainText(result.document.slides[1].elements[0].content), '隐藏的备份内容');
    assert.equal(result.warnings.length, 1);
    doc = result.document;
  }
});

test('gradient and solid fills keep independent outline alpha across editable PPTX round trips', async () => {
  const gradient = { type: 'linear', angle: 0, scaled: true, rotateWithShape: true, stops: [
    { offset: 0, color: '#2563eb', opacity: 1 }, { offset: 1, color: '#ffffff', opacity: 0.5 },
  ] };
  let doc = createDocument();
  doc.slides[0].elements = [
    createElement('shape', { gradient, opacity: 0.3, strokeWidth: 20, stroke: '#ff0000' }),
    createElement('shape', { gradient, opacity: 0.8, fillOpacity: 0.5, strokeOpacity: 0.25, strokeWidth: 8 }),
    createElement('shape', { opacity: 0.8, fillOpacity: 0.25, strokeWidth: 8 }),
    createElement('shape', { opacity: 0.8, strokeOpacity: 0.25, strokeWidth: 8 }),
    createElement('shape', { gradient, opacity: 0, strokeWidth: 8 }),
  ];
  const effectivePaint = element => ({
    fill: (element.gradient?.stops.map(stop => stop.opacity) || [1]).map(alpha => alpha * element.opacity * (element.fillOpacity ?? 1)),
    stroke: element.opacity * (element.strokeOpacity ?? 1),
  });
  const expected = doc.slides[0].elements.map(effectivePaint);
  for (let pass = 0; pass < 3; pass++) {
    const result = await readPptx(await exportPptx(doc));
    assert.deepEqual(result.warnings, []);
    result.document.slides[0].elements.forEach((element, index) => {
      const actual = effectivePaint(element);
      assert.ok(Math.abs(actual.stroke - expected[index].stroke) < 0.00001);
      actual.fill.forEach((alpha, stop) => assert.ok(Math.abs(alpha - expected[index].fill[stop]) < 0.00001));
    });
    doc = result.document;
  }
});

test('native noFill lines and arrowheads remain invisible after import and export', async () => {
  const doc = createDocument();
  doc.slides[0].elements = ['line', 'arrow'].map(shape => createElement('shape', {
    shape, stroke: '#ff0000', strokeWidth: 5, fill: 'transparent',
  }));
  const zip = await JSZip.loadAsync(await (await exportPptx(doc)).arrayBuffer());
  const path = 'ppt/slides/slide1.xml';
  const xml = new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml');
  for (const shape of children(at(xml.documentElement, 'cSld/spTree'), 'sp')) {
    const line = at(shape, 'spPr/ln');
    line.replaceChild(xml.createElementNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'a:noFill'), at(line, 'solidFill'));
  }
  zip.file(path, new XMLSerializer().serializeToString(xml));
  let file = new Blob([await zip.generateAsync({ type: 'uint8array' })]);
  for (let pass = 0; pass < 3; pass++) {
    const result = await readPptx(file);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.document.slides[0].elements.length, 2);
    assert.ok(result.document.slides[0].elements.every(element => element.opacity === 0));
    file = await exportPptx(result.document);
  }
});

test('host listener failures cannot interrupt committed edits, later subscribers or history', async t => {
  const store = new DocumentStore();
  const failures = [], snapshots = [];
  const reported = t.mock.method(console, 'error', () => {});
  store.on('change', () => { throw new Error('synchronous persistence failure'); });
  store.on('change', async () => { throw new Error('asynchronous persistence failure'); });
  store.on('change', () => snapshots.push(store.getDocument()));
  store.on('error', () => { throw new Error('broken host error handler'); });
  store.on('error', payload => failures.push(payload));
  const id = store.addElement('text', { content: paragraph('仍然可以保存') });
  store.undo();
  store.redo();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(snapshots.map(doc => doc.slides[0].elements.length), [1, 0, 1]);
  assert.equal(store.slide.elements[0].id, id);
  assert.equal(failures.length, 6);
  assert.ok(failures.every(failure => failure.sourceEvent === 'change'));
  assert.equal(reported.mock.callCount(), 6);
  assert.throws(() => store.on('change', null), TypeError);
});

test('PPTX export replaces XML-invalid characters without changing JSON or valid Unicode', async () => {
  const invalid = '\u0000\u000B\u001F\uD800\uFFFE\uFFFF';
  const valid = '中文 & <xml> 😀\t结束';
  const doc = createDocument('Title ' + invalid + valid);
  doc.assets.pixel = { ...image, name: 'image ' + invalid + valid };
  doc.slides[0].elements = [createElement('text', { content: paragraph(invalid + valid) }), createElement('image', { assetId: 'pixel', width: 100, height: 100 })];
  const before = structuredClone(doc);
  const blob = await exportPptx(doc);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  for (const file of Object.values(zip.files).filter(file => /\.(xml|rels)$/.test(file.name))) {
    const xml = await file.async('string');
    assert.doesNotMatch(xml, /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u, file.name);
    assert.ok(new DOMParser().parseFromString(xml, 'application/xml').documentElement, file.name);
  }
  const imported = await readPptx(blob);
  assert.equal(plainText(imported.document.slides[0].elements[0].content), '\uFFFD'.repeat(6) + valid);
  assert.deepEqual(doc, before);
});

test('pending image insertion cannot leak into a reloaded document with the same slide IDs', async t => {
  const originals = { createImageBitmap: globalThis.createImageBitmap, FileReader: globalThis.FileReader };
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  let decode;
  globalThis.createImageBitmap = () => new Promise(resolve => { decode = resolve; });
  globalThis.FileReader = class {
    readAsDataURL() { this.result = png; queueMicrotask(() => this.onload()); }
  };
  const store = new DocumentStore();
  const owner = { store, text: { stop() {} } };
  const file = new Blob(['synthetic decoded image'], { type: 'image/png' });
  const pending = SlideEditor.prototype.addImage.call(owner, file);
  const reloaded = store.getDocument();
  reloaded.title = '重新加载的文稿';
  store.setDocument(reloaded);
  decode({ width: 1, height: 1, close() {} });
  await assert.rejects(pending, /文稿已重新加载/);
  assert.deepEqual(store.getDocument(), reloaded);
  const ordinaryEdit = SlideEditor.prototype.addImage.call(owner, file);
  store.addElement('text');
  decode({ width: 1, height: 1, close() {} });
  const id = await ordinaryEdit;
  assert.equal(store.slide.elements.find(element => element.id === id).type, 'image');
  assert.equal(store.slide.elements.length, 2);
});

test('save shortcut includes the active text session and remains available in view mode', () => {
  for (const mode of ['edit', 'view']) {
    let saved = 0, prevented = 0;
    const owner = {
      store: { mode }, text: { id: 'active-text' },
      run: action => action(), downloadJSON: () => { saved += 1; },
    };
    const event = { key: 's', metaKey: true, target: { closest: () => false }, preventDefault: () => { prevented += 1; } };
    SlideEditor.prototype.keydown.call(owner, event);
    assert.equal(saved, 1);
    assert.equal(prevented, 1);
    SlideEditor.prototype.keydown.call(owner, { ...event, isComposing: true });
    assert.equal(saved, 1);
  }
});
