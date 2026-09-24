window.mountSlideKitDemo = function ({ createEditor, createDocument, createElement, paragraph }) {
  const root = document.querySelector('#examples');
  function mountCard(label, accent) {
    const card = document.createElement('section');
    card.className = 'host-card';
    const heading = document.createElement('h2');
    heading.textContent = label;
    const actions = document.createElement('div');
    actions.className = 'host-actions';
    const container = document.createElement('div');
    container.className = 'host-editor';
    const report = document.createElement('p');
    report.className = 'host-report';
    report.setAttribute('role', 'status');
    const hostInput = document.createElement('input');
    hostInput.className = 'host-input';
    hostInput.placeholder = '宿主输入框：编辑这里不会触发幻灯片快捷键';
    hostInput.setAttribute('aria-label', label + '宿主输入框');
    card.append(heading, actions, container, report, hostInput);
    root.append(card);
    const doc = createDocument(label);
    doc.slides[0].elements.push(createElement('text', {
      content: paragraph('把创作能力，放进你的产品。'),
      width: 1000, height: 150, fontSize: 44, color: accent,
    }), createElement('shape', { x: 120, y: 330, width: 260, height: 150, shape: 'roundRect', fill: accent }));
    let editor;
    let saved = doc;
    let view = false;
    let changes = 0;
    let mounts = 0;
    let unsubscribe = () => {};
    function describe(note = '') {
      const snapshot = editor.getDocument();
      report.textContent = note + '\n' + snapshot.slides.length + ' 页 · ' +
        snapshot.slides.reduce((count, slide) => count + slide.elements.length, 0) + ' 个元素 · ' +
        changes + ' 次变更 · 第 ' + mounts + ' 次挂载 · ' + (view ? '只读模式' : '编辑模式');
    }
    function mount() {
      editor = createEditor(container, { document: saved, theme: { accent }, mode: view ? 'view' : 'edit' });
      mounts += 1;
      unsubscribe = editor.on('change', () => { changes += 1; describe('文稿已变更'); });
      editor.on('error', ({ message }) => { report.textContent = message; });
      describe('实例已挂载');
    }
    function action(label, callback) {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', () => {
        try { callback(); } catch (error) { report.textContent = error.message; }
      });
      actions.append(button);
    }
    action('保存快照', () => { saved = editor.getDocument(); describe('JSON 快照已保存到宿主内存'); });
    action('加载快照', () => { editor.setDocument(saved); describe('已加载快照，撤销历史已清空'); });
    action('切换只读', () => { view = !view; editor.setMode(view ? 'view' : 'edit'); describe('模式已切换'); });
    action('销毁并重新挂载', () => {
      saved = editor.getDocument(); unsubscribe(); editor.destroy(); editor.destroy(); mount();
    });
    mount();
    return () => { unsubscribe(); editor.destroy(); };
  }
  const dispose = [mountCard('实例 A', '#5c5bd6'), mountCard('实例 B', '#167c77')];
  window.addEventListener('pagehide', event => {
    if (!event.persisted) dispose.forEach(destroy => destroy());
  });
};
