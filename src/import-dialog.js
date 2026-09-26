import { dom } from './render.js';
import { button } from './ui-controls.js';
import { createTranslator } from './i18n.js';

export function createImportDialog(root, controller, format = 'PDF', t = createTranslator()) {
  const previousFocus = document.activeElement;
  const siblings = [...root.children].map(node => [node, node.inert]);
  siblings.forEach(([node]) => { node.inert = true; });
  const overlay = dom('div', 'sk-import-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const panel = dom('div', 'sk-import-panel');
  const heading = dom('h3');
  const status = dom('p', 'sk-import-status');
  status.setAttribute('aria-live', 'polite');
  let statusMessage = '正在打开 {format}…';
  let statusParameters = { format };
  const setStatus = (message, parameters = {}) => {
    statusMessage = message; statusParameters = parameters;
    status.textContent = t(message, parameters);
  };
  const progress = dom('progress');
  const form = dom('form', 'sk-pdf-password');
  form.hidden = true;
  const label = dom('label');
  const passwordLabel = dom('span');
  const input = dom('input', 'sk-input');
  input.type = 'password'; input.autocomplete = 'off';
  label.append(passwordLabel, input);
  const submit = dom('button', 'sk-button sk-primary');
  submit.type = 'submit';
  form.append(label, submit);
  let resolvePassword;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const password = input.value;
    input.value = ''; form.hidden = true; progress.hidden = false;
    setStatus('正在解锁 PDF…');
    resolvePassword?.(password); resolvePassword = null;
  });
  const cancel = button(t('取消导入'), null, () => controller.abort());
  const notes = {
    PDF: '每页将作为图像导入，可继续叠加文字和形状。',
    PPTX: '正在读取页面、文字、形状和图片，完成后可继续编辑。',
    JSON: '校验完成后加载文稿；失败或取消时保留当前内容。',
  };
  const note = dom('p', 'sk-import-note');
  function refresh() {
    heading.textContent = t('打开 {format}', { format });
    overlay.setAttribute('aria-label', heading.textContent);
    status.textContent = t(statusMessage, statusParameters);
    progress.setAttribute('aria-label', t('{format} 导入进度', { format }));
    passwordLabel.textContent = t('PDF 打开密码');
    input.setAttribute('aria-label', passwordLabel.textContent);
    submit.textContent = t('解锁 PDF');
    cancel.firstChild.textContent = cancel.title = t('取消导入');
    cancel.setAttribute('aria-label', cancel.title);
    note.textContent = t(notes[format]);
  }
  refresh();
  panel.append(heading, status, progress, form, note, cancel);
  overlay.append(panel); root.append(overlay); cancel.focus();
  const onAbort = () => { resolvePassword?.(''); resolvePassword = null; };
  controller.signal.addEventListener('abort', onAbort, { once: true });
  return {
    refresh,
    progress({ page, total }) {
      setStatus('正在转换第 {page} / {total} 页', { page, total });
      progress.max = total; progress.value = page - 1;
    },
    password(incorrect) {
      setStatus(incorrect ? '密码不正确，请重试' : '此 PDF 已加密，请输入打开密码');
      progress.hidden = true; form.hidden = false; input.focus();
      return new Promise(resolve => { resolvePassword = resolve; });
    },
    destroy() {
      controller.signal.removeEventListener('abort', onAbort);
      onAbort(); overlay.remove();
      siblings.forEach(([node, inert]) => { node.inert = inert; });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    },
  };
}
