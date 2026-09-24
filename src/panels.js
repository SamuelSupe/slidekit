import { dom, renderSlide } from './render.js';
import { icon } from './icons.js';
import { plainText, PAGE_SIZES, BLOCK_ARROWS } from './document.js';
import { button, field, numberInput, selectInput, colorInput, section } from './ui-controls.js';

export class Panels {
  constructor(owner) {
    this.owner = owner;
    this.layerMode = false;
    this.left = dom('aside', 'sk-thumbnails');
    this.left.setAttribute('aria-label', '幻灯片列表');
    this.right = dom('aside', 'sk-inspector');
    this.right.setAttribute('aria-label', '属性面板');
  }
  renderThumbnails() {
    const { owner, left } = this;
    const { store } = owner;
    const header = dom('div', 'sk-panel-heading');
    header.append(dom('span', '', '幻灯片'), dom('span', 'sk-count', String(store.doc.slides.length)));
    const add = button('新增幻灯片', 'plus', () => owner.run(() => owner.addSlide()), 'sk-icon-only');
    add.disabled = store.mode === 'view';
    header.append(add);
    const list = dom('div', 'sk-thumb-list');
    store.doc.slides.forEach((slide, index) => {
      const row = dom('div', 'sk-thumb-row' + (slide.id === store.slideId ? ' sk-current' : ''));
      const label = slide.name + (slide.hidden ? '（已隐藏）' : '');
      const number = dom('span', 'sk-thumb-number', String(index + 1).padStart(2, '0'));
      const thumb = dom('button', 'sk-thumb');
      thumb.type = 'button';
      thumb.setAttribute('aria-label', '第 ' + (index + 1) + ' 页：' + label);
      thumb.setAttribute('aria-current', String(slide.id === store.slideId));
      thumb.style.aspectRatio = store.doc.width + '/' + store.doc.height;
      const preview = renderSlide(slide, store.doc);
      preview.querySelectorAll('img').forEach(image => { image.loading = 'lazy'; image.decoding = 'async'; });
      preview.style.transform = 'scale(' + 154 / store.doc.width + ')';
      thumb.append(preview);
      thumb.addEventListener('click', () => owner.run(() => owner.goToSlide(slide.id)));
      thumb.draggable = store.mode === 'edit';
      thumb.addEventListener('dragstart', event => {
        event.dataTransfer.setData('application/x-slidekit-slide', slide.id);
        event.dataTransfer.effectAllowed = 'move';
      });
      thumb.addEventListener('dragover', event => {
        if (event.dataTransfer.types.includes('application/x-slidekit-slide')) {
          event.preventDefault(); row.classList.add('sk-drop-target');
        }
      });
      thumb.addEventListener('dragleave', () => row.classList.remove('sk-drop-target'));
      thumb.addEventListener('drop', event => {
        event.preventDefault(); row.classList.remove('sk-drop-target');
        const id = event.dataTransfer.getData('application/x-slidekit-slide');
        if (id) owner.run(() => { owner.text.stop(); store.moveSlide(id, index); });
      });
      const card = dom('div', 'sk-thumb-card');
      card.append(thumb, dom('span', 'sk-thumb-name', label));
      row.append(number, card);
      list.append(row);
    });
    const footer = dom('div', 'sk-thumb-footer');
    const copy = button('复制页面', 'copy', () => owner.run(() => { owner.text.stop(); store.duplicateSlide(); }));
    const remove = button('删除页面', 'trash', () => owner.run(() => { owner.text.stop(); store.deleteSlide(); }), 'sk-icon-only');
    copy.disabled = remove.disabled = store.mode === 'view';
    footer.append(copy, remove);
    const scroll = left.querySelector('.sk-thumb-list')?.scrollTop || 0;
    left.replaceChildren(header, list, footer);
    list.scrollTop = scroll;
  }
  renderInspector() {
    const { owner, right } = this;
    if (right.contains(document.activeElement) && document.activeElement.matches('input,select')) return;
    const { store } = owner;
    const tabs = dom('div', 'sk-inspector-tabs');
    for (const [layer, label, glyph] of [[false, '属性', 'cursor'], [true, '图层', 'layers']]) {
      const tab = button(label, glyph, () => { this.layerMode = layer; this.renderInspector(); }, this.layerMode === layer ? 'sk-active' : '');
      tabs.append(tab);
    }
    const content = dom('div', 'sk-inspector-content');
    if (this.layerMode) this.renderLayers(content);
    else this.renderProperties(content);
    if (store.mode === 'view') {
      content.querySelectorAll('input,select,button').forEach(control => { control.disabled = true; });
    }
    right.replaceChildren(tabs, content);
  }
  renderProperties(content) {
    const { owner } = this, { store } = owner;
    const selected = store.elements;
    if (!selected.length) {
      const name = dom('input', 'sk-input');
      name.value = store.slide.name;
      name.addEventListener('change', () => owner.run(() => store.updateSlide(store.slideId, { name: name.value })));
      const preset = Object.entries(PAGE_SIZES).find(([, [width, height]]) => width === store.doc.width && height === store.doc.height)?.[0];
      const sizes = [['wide', '宽屏 16:9'], ['standard', '标准 4:3']];
      if (!preset) sizes.unshift(['custom', '原始页面比例']);
      const size = selectInput(sizes, preset || 'custom', value => owner.run(() => {
        if (value === 'custom') return;
        owner.text.stop();
        const [width, height] = PAGE_SIZES[value];
        store.updateDocument({ width, height }); owner.fit();
      }));
      content.append(section('页面设置', field('页面名称', name), field('页面比例', size),
        field('背景颜色', colorInput(store.slide.background, value => owner.run(() => store.updateSlide(store.slideId, { background: value, backgroundGradient: null })))),
        button(store.slide.hidden ? '取消隐藏页面' : '放映时隐藏页面', null, () => owner.run(() => store.updateSlide(store.slideId, { hidden: !store.slide.hidden })))));
      const hint = dom('div', 'sk-inspector-hint');
      hint.append(icon('cursor', 30), dom('strong', '', '让想法落在画布上'), dom('p', '', '选择文字、图片或形状，在这里调整它的外观。'));
      content.append(hint);
      const shortcuts = dom('div', 'sk-shortcuts');
      const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
      for (const [label, keys] of [['撤销操作', mod + ' Z'], ['复制元素', mod + ' D'], ['多选元素', 'Shift + 单击'], ['精细移动', '方向键'], ['退出编辑', 'Esc']]) {
        const row = dom('div'); row.append(dom('span', '', label), dom('kbd', '', keys)); shortcuts.append(row);
      }
      content.append(section('快捷操作', shortcuts));
      return;
    }
    const heading = selected.length > 1 ? '已选择 ' + selected.length + ' 个元素' : { text: '文字', shape: '形状', image: '图片' }[selected[0].type];
    content.append(dom('div', 'sk-element-heading', heading));
    if (selected.length === 1) {
      const element = selected[0];
      const update = patch => owner.run(() => { owner.text.stop(); store.updateElement(element.id, patch); });
      const geometry = dom('div', 'sk-field-grid');
      for (const [key, label, min] of [['x', 'X', -100000], ['y', 'Y', -100000], ['width', '宽度', 1], ['height', '高度', 1]]) {
        geometry.append(field(label, numberInput(element[key], value => update({ [key]: value }), { min })));
      }
      geometry.append(field('旋转 °', numberInput(element.rotation, value => update({ rotation: value }))),
        field('不透明度 %', numberInput(element.opacity * 100, value => update({ opacity: value / 100 }), { min: 0, max: 100 })));
      content.append(section('位置与尺寸', geometry));
      if (element.type === 'shape') {
        const appearance = section('外观',
          ...(!element.gradient ? [field('填充', colorInput(element.fill, value => update({ fill: value })))] : []),
          ...(!['line', 'arrow'].includes(element.shape) ? [field('填充不透明度 %', numberInput((element.fillOpacity ?? 1) * 100, value => update({ fillOpacity: value / 100 }), { min: 0, max: 100 }))] : []),
          field('描边', colorInput(element.stroke, value => update({ stroke: value }))),
          field('描边宽度', numberInput(element.strokeWidth, value => update({ strokeWidth: value }), { min: 0, max: 30 })),
          field('描边不透明度 %', numberInput((element.strokeOpacity ?? 1) * 100, value => update({ strokeOpacity: value / 100 }), { min: 0, max: 100 })),
        );
        const fillMode = selectInput([['solid', '纯色'], ['linear', '线性渐变']], element.gradient ? 'linear' : 'solid', value => {
          fillMode.blur();
          update({ gradient: value === 'linear' ? { type: 'linear', angle: 0, scaled: true, rotateWithShape: true, stops: [{ offset: 0, color: element.fill === 'transparent' ? '#5969d9' : element.fill, opacity: 1 }, { offset: 1, color: '#ffffff', opacity: 1 }] } : null });
        });
        if (!['line', 'arrow'].includes(element.shape)) appearance.insertBefore(field('填充方式', fillMode), appearance.children[1] || null);
        if (element.gradient) {
          appearance.append(field('渐变角度 °', numberInput(element.gradient.angle, value => update({ gradient: { ...store.elements[0].gradient, angle: value } }), { min: -360, max: 360 })));
          element.gradient.stops.forEach((stop, index) => {
            const changeStop = patch => {
              const gradient = structuredClone(store.elements[0].gradient);
              Object.assign(gradient.stops[index], patch);
              update({ gradient });
            };
            appearance.append(field('色标 ' + (index + 1), colorInput(stop.color, value => changeStop({ color: value }))));
          });
        }
        if (BLOCK_ARROWS.includes(element.shape)) appearance.append(field('箭杆比例 %', numberInput((element.arrowShaft ?? 0.5) * 100, value => update({ arrowShaft: value / 100 }), { min: 0, max: 100 })));
        content.append(appearance);
      }
      const shadowSection = section('阴影');
      const shadowMode = selectInput([['none', '无阴影'], ['outer', '外阴影']], element.shadow ? 'outer' : 'none', value => {
        shadowMode.blur();
        update({ shadow: value === 'outer' ? { color: '#000000', opacity: 0.2, blur: 16, offsetX: 4, offsetY: 4, rotateWithShape: false } : null });
      });
      shadowSection.append(field('阴影类型', shadowMode));
      if (element.shadow) {
        const changeShadow = patch => update({ shadow: { ...store.elements[0].shadow, ...patch } });
        shadowSection.append(field('阴影颜色', colorInput(element.shadow.color, value => changeShadow({ color: value }))));
        for (const [key, label, min, max] of [['blur', '阴影模糊', 0, 1000], ['offsetX', '阴影水平偏移', -10000, 10000], ['offsetY', '阴影垂直偏移', -10000, 10000]]) shadowSection.append(field(label, numberInput(element.shadow[key], value => changeShadow({ [key]: value }), { min, max })));
        shadowSection.append(field('阴影不透明度 %', numberInput(element.shadow.opacity * 100, value => changeShadow({ opacity: value / 100 }), { min: 0, max: 100 })));
      }
      content.append(shadowSection);
      if (element.type === 'image') content.append(section('图片设置',
        field('显示方式', selectInput([['contain', '完整显示'], ['cover', '填满裁切']], element.fit, value => update({ fit: value }))),
        dom('p', 'sk-note', '图片已包含在文稿中，保存后可离线恢复。'),
      ));
      if (element.type === 'text') content.append(section('文字样式',
        field('默认字号', numberInput(element.fontSize, value => update({ fontSize: value }), { min: 1, max: 256 })),
        field('默认文字颜色', colorInput(element.color, value => update({ color: value }))),
        dom('p', 'sk-note', '双击文字进入编辑，选中文字后使用上方工具栏设置局部样式。'),
      ));
      const layer = dom('div', 'sk-action-row');
      layer.append(button('置于顶层', 'front', () => owner.run(() => store.reorderElement(element.id, 'front'))),
        button('置于底层', 'back', () => owner.run(() => store.reorderElement(element.id, 'back'))));
      const lock = button(element.locked ? '解除锁定' : '锁定元素', element.locked ? 'unlock' : 'lock', () => update({ locked: !element.locked }));
      content.append(section('图层顺序', layer, lock));
      if (element.locked) content.querySelectorAll('input,select').forEach(control => { control.disabled = true; });
    }
    const alignment = dom('div', 'sk-align-grid');
    for (const [key, label, glyph] of [
      ['left', '左对齐', 'alignLeft'], ['center', '水平居中', 'alignCenter'], ['right', '右对齐', 'alignRight'],
      ['top', '顶部对齐', 'alignTop'], ['middle', '垂直居中', 'alignMiddle'], ['bottom', '底部对齐', 'alignBottom'],
    ]) alignment.append(button(label, glyph, () => owner.align(key), 'sk-icon-only'));
    const distribution = dom('div', 'sk-action-row');
    const horizontal = button('水平等距', 'distributeX', () => owner.distribute('x'));
    const vertical = button('垂直等距', 'distributeY', () => owner.distribute('y'));
    horizontal.disabled = vertical.disabled = selected.filter(element => !element.locked).length < 3;
    distribution.append(horizontal, vertical);
    content.append(section('对齐与分布', alignment, distribution));
  }
  renderLayers(content) {
    const { owner } = this, { store } = owner;
    content.append(dom('p', 'sk-note', '上方元素显示在前面。'));
    if (!store.slide.elements.length) content.append(dom('div', 'sk-empty', '这一页还没有元素'));
    [...store.slide.elements].reverse().forEach(element => {
      const row = dom('div', 'sk-layer' + (store.selected.includes(element.id) ? ' sk-active' : ''));
      const name = element.type === 'text' ? plainText(element.content).slice(0, 30) || '空文本' : element.type === 'image' ? store.doc.assets[element.assetId].name : { rect: '矩形', roundRect: '圆角矩形', ellipse: '椭圆', line: '直线', arrow: '箭头', rightArrow: '向右箭头', leftArrow: '向左箭头', upArrow: '向上箭头', downArrow: '向下箭头', leftRightArrow: '水平双向箭头', upDownArrow: '垂直双向箭头' }[element.shape];
      const select = button(name, element.type === 'shape' ? BLOCK_ARROWS.includes(element.shape) ? 'arrow' : element.shape : element.type, event => owner.run(() => {
        owner.text.stop();
        store.selectElements(event.shiftKey ? [...store.selected, element.id] : [element.id]);
      }));
      row.append(select, button(element.locked ? '解锁' : '锁定', element.locked ? 'lock' : 'unlock', () => owner.run(() => {
        owner.text.stop(); store.updateElement(element.id, { locked: !element.locked });
      }), 'sk-icon-only'));
      content.append(row);
    });
  }
}
