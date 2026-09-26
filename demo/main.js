import { createEditor, validateDocument, SUPPORTED_LOCALES } from '../src/index.js';
import { createTranslator } from '../src/i18n.js';
import { sampleDocument } from './sample.js';
import { openStorage } from './persistence.js';
import './style.css';

const requestedLocale = new URL(location.href).searchParams.get('locale');
const locale = SUPPORTED_LOCALES.includes(requestedLocale) ? requestedLocale : 'zh-CN';
let t = createTranslator(locale);
const language = document.querySelector('#locale');
const status = document.querySelector('#save-status');
let statusMessage = '正在打开 {format}…';
function setStatus(message) {
  statusMessage = message;
  status.textContent = t(message, { format: 'SlideKit' });
}
function renderLanguage() {
  document.documentElement.lang = language.value;
  document.title = t('SlideKit — 让想法成为演示');
  language.setAttribute('aria-label', t('界面语言'));
  document.querySelector('#examples-link').textContent = t('嵌入示例');
  const guide = document.querySelector('#guide-link');
  guide.textContent = t('接入文档 ↗');
  guide.href = language.value.startsWith('zh') ? './docs/guide.zh-CN.md' : './docs/guide.md';
  setStatus(statusMessage);
}
language.value = locale;
renderLanguage();
let storage;
let doc = sampleDocument();
try {
  storage = await openStorage();
  const saved = await storage.read();
  if (saved) doc = validateDocument(saved);
  setStatus(saved ? '已恢复浏览器中的文稿' : '改动会自动保存在此浏览器');
} catch {
  storage?.close();
  storage = null;
  setStatus('自动恢复失败，原存档已保留；自动保存已暂停，请使用 JSON 保存文稿');
}
const editor = createEditor(document.querySelector('#editor'), { document: doc, locale });
window.slidekitEditor = editor;
language.addEventListener('change', () => {
  editor.setLocale(language.value);
  t = createTranslator(editor.getLocale());
  const url = new URL(location.href);
  url.searchParams.set('locale', editor.getLocale());
  history.replaceState(null, '', url);
  renderLanguage();
});
let timer;
let revision = 0;
let savedRevision = 0;
async function save() {
  if (!storage || revision === savedRevision) return;
  const current = revision;
  try {
    await storage.write(editor.getDocument());
    savedRevision = current;
    if (revision === current) setStatus('所有改动已保存在此浏览器');
  } catch (error) {
    setStatus(error?.name === 'StorageConflictError' ? error.message : '自动保存失败，请使用 JSON 保存文稿');
  }
}
function scheduleSave() {
  revision += 1;
  if (!storage) return;
  setStatus('正在保存…');
  clearTimeout(timer);
  timer = setTimeout(save, 400);
}
editor.on('change', scheduleSave);
// IME drafts are visible to getDocument() before they emit a committed change.
editor.element.addEventListener('input', event => {
  if (event.target.isContentEditable) scheduleSave();
});
window.addEventListener('beforeunload', event => {
  if (revision === savedRevision) return;
  // IndexedDB callbacks may not run after pagehide. Give the user a chance to
  // keep the page open until persistence finishes or export failed saves.
  clearTimeout(timer);
  save();
  event.preventDefault();
  event.returnValue = '';
});
window.addEventListener('pagehide', () => { clearTimeout(timer); save(); });
