import { dom } from './render.js';
import { icon } from './icons.js';
import { button, numberInput, selectInput } from './ui-controls.js';

function menu(label, iconName, items) {
  const details = dom('details', 'sk-menu');
  const summary = dom('summary', 'sk-button');
  summary.append(icon(iconName), dom('span', '', label), icon('chevron', 12));
  const list = dom('div', 'sk-menu-list');
  for (const [text, glyph, action] of items) list.append(button(text, glyph, () => { details.open = false; action(); }));
  details.append(summary, list);
  return details;
}

export class Toolbar {
  constructor(owner) {
    this.owner = owner;
    const t = owner.t;
    this.editButtons = [];
    this.textControls = [];
    const header = dom('header', 'sk-header');
    const brand = dom('div', 'sk-brand');
    brand.append(dom('span', 'sk-brand-symbol'), dom('span', '', 'SlideKit'));
    brand.firstChild.append(icon('logo', 20));
    this.title = dom('input', 'sk-document-title');
    this.title.setAttribute('aria-label', t('文稿标题'));
    this.title.addEventListener('change', () => owner.run(() => owner.store.updateDocument({ title: this.title.value.trim() || owner.t('未命名演示文稿') })));
    this.badge = dom('span', 'sk-mode-badge', t('演示文稿'));
    const titleArea = dom('div', 'sk-title-area');
    titleArea.append(this.title, this.badge);
    const right = dom('div', 'sk-header-actions');
    right.append(
      button(t('打开'), 'upload', () => owner.openDocument()),
      menu(t('导出'), 'download', [
        ['PowerPoint (.pptx)', 'presentation', () => owner.downloadPptx()],
        [t('保存文稿 (.json)'), 'json', () => owner.run(() => owner.downloadJSON())],
      ]),
      button(t('放映'), 'play', () => owner.run(() => owner.present()), 'sk-primary'),
    );
    right.firstChild.title = t('打开 PowerPoint PPTX、PDF 或 SlideKit JSON');
    header.append(brand, titleArea, right);
    const tools = dom('div', 'sk-tools');
    this.undo = button(t('撤销'), 'undo', () => owner.run(() => owner.undo()), 'sk-icon-only');
    this.redo = button(t('重做'), 'redo', () => owner.run(() => owner.redo()), 'sk-icon-only');
    const separator = () => dom('span', 'sk-separator');
    const createButton = (label, glyph, action) => {
      const node = button(label, glyph, () => owner.run(action));
      this.editButtons.push(node); return node;
    };
    this.shapeMenu = menu(t('形状'), 'shapes', [
      [t('矩形'), 'rect', () => owner.insertShape('rect')], [t('圆角矩形'), 'roundRect', () => owner.insertShape('roundRect')],
      [t('椭圆'), 'ellipse', () => owner.insertShape('ellipse')], [t('直线'), 'line', () => owner.insertShape('line')],
      [t('箭头'), 'arrow', () => owner.insertShape('arrow')],
      [t('块状箭头'), 'arrow', () => owner.insertShape('rightArrow')],
      [t('双向块状箭头'), 'arrow', () => owner.insertShape('leftRightArrow')],
    ]);
    this.arrangeMenu = menu(t('排列'), 'layers', [
      [t('左对齐'), 'alignLeft', () => owner.align('left')], [t('水平居中'), 'alignCenter', () => owner.align('center')],
      [t('右对齐'), 'alignRight', () => owner.align('right')], [t('顶部对齐'), 'alignTop', () => owner.align('top')],
      [t('垂直居中'), 'alignMiddle', () => owner.align('middle')], [t('底部对齐'), 'alignBottom', () => owner.align('bottom')],
      [t('水平等距分布'), 'distributeX', () => owner.distribute('x')], [t('垂直等距分布'), 'distributeY', () => owner.distribute('y')],
    ]);
    tools.append(this.undo, this.redo, separator(),
      createButton(t('新建页面'), 'plus', () => owner.addSlide()),
      separator(), createButton(t('文字'), 'text', () => owner.insertText()),
      createButton(t('图片'), 'image', () => owner.openImage()), this.shapeMenu, separator(), this.arrangeMenu,
    );
    const panelButtons = dom('div', 'sk-panel-buttons');
    panelButtons.append(button(t('切换页面栏'), 'panelLeft', () => owner.togglePanel('thumbnails'), 'sk-icon-only'), button(t('切换属性栏'), 'panelRight', () => owner.togglePanel('inspector'), 'sk-icon-only'));
    tools.append(panelButtons);
    const format = dom('div', 'sk-format');
    this.fontFamily = selectInput([
      ['Arial', 'Arial'], ['Aptos', 'Aptos'], ['Georgia', 'Georgia'],
      ['PingFang SC', t('苹方')], ['Microsoft YaHei', t('微软雅黑')], ['Noto Sans CJK SC', t('思源黑体')],
    ], 'Arial', value => owner.run(() => owner.text.format('fontFamily', value)));
    this.fontFamily.setAttribute('aria-label', t('字体'));
    this.fontFamily.classList.add('sk-font-family');
    this.fontSize = numberInput(28, value => owner.run(() => owner.text.format('fontSize', value)), { min: 1, max: 256 });
    this.fontSize.setAttribute('aria-label', t('字号'));
    this.fontSize.classList.add('sk-font-size');
    this.textControls.push(this.fontFamily, this.fontSize);
    format.append(this.fontFamily, this.fontSize, separator());
    this.styleButtons = {};
    for (const [command, label] of [['bold', t('加粗')], ['italic', t('斜体')], ['underline', t('下划线')]]) {
      const control = button(label, command, () => owner.run(() => owner.text.format(command)), 'sk-icon-only');
      this.styleButtons[command] = control;
      this.textControls.push(control);
      format.append(control);
    }
    this.color = dom('input', 'sk-text-color');
    this.color.type = 'color';
    this.color.title = t('文字颜色'); this.color.setAttribute('aria-label', t('文字颜色'));
    this.color.addEventListener('change', () => owner.run(() => owner.text.format('color', this.color.value)));
    this.textControls.push(this.color);
    format.append(this.color, separator());
    for (const [alignment, label] of [['left', t('文字左对齐')], ['center', t('文字居中')], ['right', t('文字右对齐')]]) {
      const control = button(label, alignment, () => owner.run(() => owner.text.format('align', alignment)), 'sk-icon-only');
      this.textControls.push(control); format.append(control);
    }
    format.append(separator());
    for (const [command, label] of [['bulletList', t('项目列表')], ['orderedList', t('编号列表')]]) {
      const control = button(label, command, () => owner.run(() => owner.text.format(command)), 'sk-icon-only');
      this.styleButtons[command] = control;
      this.textControls.push(control); format.append(control);
    }
    this.lineHeight = selectInput([['1', '1.0'], ['1.2', '1.2'], ['1.3', '1.3'], ['1.5', '1.5'], ['1.8', '1.8'], ['2', '2.0']], '1.3', value => owner.run(() => owner.text.format('lineHeight', value)));
    this.lineHeight.setAttribute('aria-label', t('行距'));
    this.lineHeight.title = t('行距');
    this.lineHeight.classList.add('sk-line-height');
    this.textControls.push(this.lineHeight);
    format.append(this.lineHeight);
    format.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) event.preventDefault();
    });
    this.nodes = [header, tools, format];
    this.tools = tools;
    this.format = format;
    this.update();
  }
  update() {
    const { store, t } = this.owner;
    const view = store.mode === 'view';
    if (document.activeElement !== this.title) this.title.value = store.doc.title;
    this.title.readOnly = view;
    this.badge.textContent = view ? t('只读模式') : t('演示文稿');
    this.undo.disabled = view || !store.history.past.length;
    this.redo.disabled = view || !store.history.future.length;
    for (const control of this.editButtons) control.disabled = view;
    this.shapeMenu.hidden = view;
    this.arrangeMenu.hidden = view;
    this.updateText();
  }
  updateText() {
    const { store, text } = this.owner;
    const element = store.elements.find(item => item.type === 'text' && !item.locked);
    const enabled = !!element && store.mode === 'edit';
    for (const control of this.textControls) control.disabled = !enabled;
    if (!element) return;
    const attrs = text?.editor?.getAttributes('textStyle') || {};
    if (document.activeElement !== this.fontFamily) this.fontFamily.value = attrs.fontFamily || element.fontFamily;
    if (document.activeElement !== this.fontSize) this.fontSize.value = String(parseFloat(attrs.fontSize) || element.fontSize);
    if (document.activeElement !== this.color) this.color.value = attrs.color || element.color;
    if (document.activeElement !== this.lineHeight) this.lineHeight.value = text?.editor?.getAttributes('paragraph').lineHeight || String(element.lineHeight);
    for (const [command, control] of Object.entries(this.styleButtons)) {
      const active = text?.editor?.isActive(command) || false;
      control.classList.toggle('sk-active', active);
      control.setAttribute('aria-pressed', String(active));
    }
  }
}
