import { dom } from './render.js';
import { button } from './ui-controls.js';

export function createImportDialog(root, controller, format = 'PDF') {
  const previousFocus = document.activeElement;
  const siblings = [...root.children].map(node => [node, node.inert]);
  siblings.forEach(([node]) => { node.inert = true; });
  const overlay = dom('div', 'sk-import-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '打开 ' + format);
  const panel = dom('div', 'sk-import-panel');
  const status = dom('p', 'sk-import-status', '正在打开 ' + format + '…');
  status.setAttribute('aria-live', 'polite');
  const progress = dom('progress');
  progress.setAttribute('aria-label', format + ' 导入进度');
  const form = dom('form', 'sk-pdf-password');
  form.hidden = true;
  const label = dom('label', '', 'PDF 打开密码');
  const input = dom('input', 'sk-input');
  input.type = 'password'; input.autocomplete = 'off';
  input.setAttribute('aria-label', 'PDF 打开密码');
  label.append(input);
  const submit = dom('button', 'sk-button sk-primary', '解锁 PDF');
  submit.type = 'submit';
  form.append(label, submit);
  let resolvePassword;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const password = input.value;
    input.value = ''; form.hidden = true; progress.hidden = false;
    status.textContent = '正在解锁 PDF…';
    resolvePassword?.(password); resolvePassword = null;
  });
  const cancel = button('取消导入', null, () => controller.abort());
  const notes = {
    PDF: '每页将作为图像导入，可继续叠加文字和形状。',
    PPTX: '正在读取页面、文字、形状和图片，完成后可继续编辑。',
    JSON: '校验完成后加载文稿；失败或取消时保留当前内容。',
  };
  panel.append(dom('h3', '', '打开 ' + format), status, progress, form,
    dom('p', 'sk-import-note', notes[format]), cancel);
  overlay.append(panel); root.append(overlay); cancel.focus();
  const onAbort = () => { resolvePassword?.(''); resolvePassword = null; };
  controller.signal.addEventListener('abort', onAbort, { once: true });
  return {
    progress({ page, total }) {
      status.textContent = '正在转换第 ' + page + ' / ' + total + ' 页';
      progress.max = total; progress.value = page - 1;
    },
    password(incorrect) {
      status.textContent = incorrect ? '密码不正确，请重试' : '此 PDF 已加密，请输入打开密码';
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
