import { at, attr, children, numeric } from './pptx-package.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const defaultColors = { dk1: '000000', lt1: 'FFFFFF', dk2: '202A3A', lt2: 'F3F4F8', accent1: '5969D9' };

export function readTheme(root, colorMap) {
  const colors = { ...defaultColors };
  for (const item of children(at(root, 'themeElements/clrScheme'))) {
    const color = children(item)[0];
    colors[item.localName] = attr(color, 'lastClr') || attr(color, 'val');
  }
  const aliases = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
  for (const attribute of Array.from(colorMap?.attributes || [])) aliases[attribute.localName] = attribute.value;
  const fonts = {};
  for (const [kind, name] of [['mj', 'majorFont'], ['mn', 'minorFont']]) {
    const font = at(root, 'themeElements/fontScheme/' + name);
    const chinese = children(font, 'font').find(item => attr(item, 'script') === 'Hans');
    fonts['+' + kind + '-lt'] = attr(at(font, 'latin'), 'typeface') || 'Arial';
    fonts['+' + kind + '-ea'] = attr(at(font, 'ea'), 'typeface') || attr(chinese, 'typeface') || fonts['+' + kind + '-lt'];
    fonts['+' + kind + '-cs'] = attr(at(font, 'cs'), 'typeface') || fonts['+' + kind + '-lt'];
  }
  return { colors, aliases, fonts };
}

export function readColor(fill, theme, fallback = '#202a3a') {
  const node = children(fill).find(child => ['srgbClr', 'schemeClr', 'sysClr', 'scrgbClr', 'prstClr'].includes(child.localName));
  if (!node) return { color: fallback, opacity: 1 };
  let hex = attr(node, 'val');
  if (node.localName === 'schemeClr') hex = theme.colors[theme.aliases[hex] || hex];
  if (node.localName === 'sysClr') hex = attr(node, 'lastClr');
  if (node.localName === 'prstClr') hex = { black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00', gray: '808080', silver: 'c0c0c0', purple: '800080', orange: 'ffa500', navy: '000080', teal: '008080', aqua: '00ffff', lime: '00ff00', maroon: '800000', fuchsia: 'ff00ff' }[hex];
  let channels = /^[\da-f]{6}$/i.test(hex || '') ? hex.match(/../g).map(value => parseInt(value, 16)) : null;
  if (node.localName === 'scrgbClr') channels = ['r', 'g', 'b'].map(key => clamp(numeric(node, key) / 100000 * 255, 0, 255));
  if (!channels) channels = fallback.slice(1).match(/../g).map(value => parseInt(value, 16));
  let opacity = 1;
  for (const change of children(node)) {
    const amount = numeric(change, 'val') / 100000;
    if (change.localName === 'alpha') opacity = amount;
    if (change.localName === 'alphaMod') opacity *= amount;
    if (change.localName === 'alphaOff') opacity += amount;
    if (['lumMod', 'shade'].includes(change.localName)) channels = channels.map(value => value * amount);
    if (change.localName === 'lumOff') channels = channels.map(value => value + 255 * amount);
    if (change.localName === 'tint') channels = channels.map(value => value + (255 - value) * amount);
  }
  return { color: '#' + channels.map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')).join(''), opacity: clamp(opacity, 0, 1) };
}
