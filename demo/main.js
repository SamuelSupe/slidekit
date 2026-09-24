import { createEditor, validateDocument } from '../src/index.js';
import { sampleDocument } from './sample.js';
import { openStorage } from './persistence.js';
import './style.css';

const status = document.querySelector('#save-status');
let storage;
let doc = sampleDocument();
try {
  storage = await openStorage();
  const saved = await storage.read();
  if (saved) doc = validateDocument(saved);
  status.textContent = saved ? '已恢复浏览器中的文稿' : '改动会自动保存在此浏览器';
} catch {
  status.textContent = '自动恢复不可用，请使用 JSON 保存文稿';
}
const editor = createEditor(document.querySelector('#editor'), { document: doc });
window.slidekitEditor = editor;
let timer;
let revision = 0;
async function save() {
  const current = revision;
  try {
    if (!storage) throw new Error('存储不可用');
    await storage.write(editor.getDocument());
    if (revision === current) status.textContent = '所有改动已保存在此浏览器';
  } catch { status.textContent = '自动保存失败，请使用 JSON 保存文稿'; }
}
editor.on('change', () => {
  revision += 1;
  status.textContent = '正在保存…';
  clearTimeout(timer);
  timer = setTimeout(save, 400);
});
window.addEventListener('pagehide', () => { clearTimeout(timer); save(); });
