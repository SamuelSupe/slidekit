import traditionalChinese from './locales/zh-TW.js';
import english from './locales/en.js';
import korean from './locales/ko.js';
import japanese from './locales/ja.js';

/** @type {readonly import('./types.js').EditorLocale[]} */
export const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'zh-TW', 'en', 'ko', 'ja']);

const catalogs = { 'zh-TW': traditionalChinese, en: english, ko: korean, ja: japanese };

/** @param {import('./types.js').EditorLocale} [locale] */
export function createTranslator(locale = 'zh-CN') {
  if (!SUPPORTED_LOCALES.includes(locale)) throw new TypeError('不支持的界面语言：' + String(locale));
  const catalog = catalogs[locale];
  return (source, parameters = {}) => {
    const template = catalog && Object.hasOwn(catalog, source) ? catalog[source] : source;
    return template.replace(/\{(\w+)\}/g, (placeholder, key) => Object.hasOwn(parameters, key) ? String(parameters[key]) : placeholder);
  };
}

// Parsers retain their original errors. Translate only known diagnostic templates
// at the UI boundary, keeping captured filenames, IDs and object names intact.
const diagnosticTemplates = Object.keys(english).filter(key => key.includes('{')).sort((a, b) =>
  Number(a.startsWith('{')) - Number(b.startsWith('{')) ||
  Number(b.includes('{message}')) - Number(a.includes('{message}')) || b.length - a.length,
).map(source => ({ source, parts: source.split(/\{(\w+)\}/), compound: source.includes('{message}') }));

function matchTemplate(message, parts) {
  if (!message.startsWith(parts[0]) || !message.endsWith(parts.at(-1))) return null;
  const end = message.length - parts.at(-1).length;
  const parameters = {};
  let start = parts[0].length;
  // Imported names and IDs are untrusted. Scan delimiters once instead of
  // backtracking over arbitrary-length captures on the browser's main thread.
  for (let index = 1; index < parts.length; index += 2) {
    const next = index === parts.length - 2 ? end : message.indexOf(parts[index + 1], start + 1);
    if (next <= start || next > end) return null;
    parameters[parts[index]] = message.slice(start, next);
    start = next + parts[index + 1].length;
  }
  return parameters;
}

export function translateMessage(message, t, depth = 0) {
  if (depth > 8) return message;
  const direct = t(message);
  if (direct !== message) return direct;
  const compound = translateTemplate(message, t, true, depth);
  if (compound !== undefined) return compound;
  if (message.includes('；')) {
    const parts = message.split('；');
    const translated = parts.map(part => translateMessage(part, t, depth + 1));
    if (parts.every((part, index) => part !== translated[index])) return translated.join(t('；'));
  }
  return translateTemplate(message, t, false, depth) ?? message;
}

function translateTemplate(message, t, compound, depth) {
  for (const template of diagnosticTemplates) {
    if (template.compound !== compound) continue;
    const { source, parts } = template;
    const parameters = matchTemplate(message, parts);
    if (!parameters) continue;
    for (const key of ['message', 'field']) {
      if (Object.hasOwn(parameters, key)) parameters[key] = translateMessage(parameters[key], t, depth + 1);
    }
    return t(source, parameters);
  }
}
