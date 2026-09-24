import { createDocument, createElement, paragraph } from '../src/document.js';

const text = (value, x, y, width, height, fontSize, color = '#243047', bold = false) => {
  const content = paragraph(value);
  if (bold) content.content[0].content[0].marks = [{ type: 'bold' }];
  return createElement('text', { content, x, y, width, height, fontSize, color });
};
const shape = (x, y, width, height, fill, extra = {}) => createElement('shape', { x, y, width, height, fill, stroke: fill, ...extra });

export function sampleDocument() {
  const doc = createDocument('让想法成为演示');
  doc.slides[0].name = '开场 · 让想法被看见';
  doc.slides[0].elements = [
    shape(76, 72, 26, 5, '#6965db'),
    text('SLIDEKIT', 116, 62, 220, 35, 13, '#5c5bd6', true),
    text('让好想法，', 76, 192, 730, 100, 58, '#263047', true),
    text('有出色的表达。', 76, 296, 850, 115, 58, '#263047', true),
    text('从第一行文字，到最后一次掌声。', 80, 448, 690, 50, 22, '#81899b'),
    text('一个轻盈、自由的演示创作空间。', 80, 492, 690, 42, 17, '#9a9fad'),
    shape(902, 174, 218, 295, '#edeafa', { shape: 'roundRect', rotation: -10 }),
    shape(958, 239, 210, 280, '#6965db', { shape: 'roundRect', rotation: 9 }),
    text('Aa', 998, 307, 160, 125, 71, '#ffffff', true),
    shape(1075, 131, 74, 74, '#f4b684', { shape: 'ellipse' }),
    shape(832, 475, 42, 42, '#c7c9ef', { shape: 'ellipse' }),
    shape(80, 628, 1120, 1, '#e8eaf1'),
    text('产品介绍', 80, 650, 200, 26, 11, '#9aa1af'),
    text('2026  /  01', 1080, 648, 130, 28, 11, '#9aa1af'),
  ];
  const second = {
    id: crypto.randomUUID(), name: '思路 · 三步完成表达', background: '#ffffff', elements: [
      text('从灵感到表达，只需三步。', 80, 72, 1110, 95, 39, '#263047', true),
      text('让工具退后一步，让你的内容走到前面。', 84, 174, 1000, 46, 19, '#8b92a3'),
    ],
  };
  [
    ['01', '写下想法', '自由编排文字、图片与形状，\n把脑海中的灵感放上画布。', '#f1effb', '#6965db'],
    ['02', '雕琢细节', '调整每一处位置与样式，\n让清晰的结构传达你的观点。', '#edf3f3', '#589995'],
    ['03', '从容呈现', '一键开启放映，或导出为\n可继续编辑的 PowerPoint。', '#fbf2e8', '#bc9264'],
  ].forEach(([number, title, description, fill, accent], index) => {
    const x = 80 + index * 388;
    second.elements.push(shape(x, 284, 344, 305, fill, { shape: 'roundRect' }),
      text(number, x + 30, 308, 90, 60, 30, accent),
      text(title, x + 30, 393, 280, 58, 27, '#263047', true),
      text(description, x + 30, 475, 294, 80, 15, '#7d8798'));
  });
  second.elements.push(text('SLIDEKIT / 工作方式', 80, 648, 500, 28, 11, '#9aa1af'), text('02', 1160, 648, 80, 28, 11, '#9aa1af'));
  const third = {
    id: crypto.randomUUID(), name: '细节 · 自由而有秩序', background: '#262a45', elements: [
      shape(81, 87, 32, 5, '#b6b0ff'),
      text('为每一个想法，留出空间。', 80, 162, 1100, 110, 45, '#ffffff', true),
      text('自由创作，也能井然有序。', 82, 292, 1000, 65, 23, '#b9bed6'),
      createElement('text', {
        x: 88, y: 408, width: 1020, height: 170, fontSize: 22, color: '#e3e4ef', lineHeight: 1.5,
        content: { type: 'doc', content: [{ type: 'bulletList', content: [
          '局部文字样式，让关键内容脱颖而出',
          '多选、对齐与参考线，让排版更从容',
          '文稿保存在你的浏览器，随时导出带走',
        ].map(value => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] })) }] },
      }),
      text('SLIDEKIT / 创作细节', 80, 650, 500, 28, 11, '#8e96b5'),
      text('03', 1160, 650, 80, 28, 11, '#8e96b5'),
    ],
  };
  doc.slides.push(second, third);
  return doc;
}
