import { dom } from './render.js';
import { icon } from './icons.js';

export function button(label, iconName, action, className = '') {
  const node = dom('button', 'sk-button ' + className);
  node.type = 'button';
  node.title = label;
  node.setAttribute('aria-label', label);
  if (iconName) node.append(icon(iconName));
  if (!className.includes('sk-icon-only')) node.append(dom('span', '', label));
  node.addEventListener('click', action);
  return node;
}
export function field(label, input) {
  const wrapper = dom('label', 'sk-field');
  wrapper.append(dom('span', 'sk-field-label', label), input);
  input.setAttribute('aria-label', label);
  return wrapper;
}
export function numberInput(value, action, { min = -100000, max = 100000, step = 'any' } = {}) {
  const input = dom('input', 'sk-input');
  input.type = 'number';
  input.value = String(Math.round(value * 100) / 100);
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.addEventListener('change', () => {
    if (input.value === '' || !input.checkValidity()) { input.value = String(value); return; }
    action(Number(input.value));
  });
  return input;
}
export function selectInput(options, value, action) {
  const select = dom('select', 'sk-input');
  for (const [key, label] of options) {
    const option = dom('option', '', label);
    option.value = key;
    select.append(option);
  }
  select.value = String(value);
  select.addEventListener('change', () => action(select.value));
  return select;
}
export function colorInput(value, action) {
  const wrapper = dom('div', 'sk-color-control');
  const picker = dom('input');
  picker.type = 'color';
  picker.value = value === 'transparent' ? '#ffffff' : value;
  picker.setAttribute('aria-label', '选择颜色');
  const text = dom('input', 'sk-input');
  text.value = value;
  text.setAttribute('aria-label', '颜色值');
  picker.addEventListener('change', () => { text.value = picker.value; action(picker.value); });
  text.addEventListener('change', () => {
    if (/^#[\da-f]{6}$/i.test(text.value) || text.value === 'transparent') action(text.value);
    else text.value = value;
  });
  wrapper.append(picker, text);
  return wrapper;
}
export function section(title, ...children) {
  const node = dom('section', 'sk-inspector-section');
  node.append(dom('h3', '', title), ...children);
  return node;
}
