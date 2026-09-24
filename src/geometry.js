export function boundingBox(elements) {
  const corners = elements.flatMap(element => {
    const angle = element.rotation * Math.PI / 180;
    const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sy]) => {
      const x = sx * element.width / 2, y = sy * element.height / 2;
      return { x: cx + x * Math.cos(angle) - y * Math.sin(angle), y: cy + x * Math.sin(angle) + y * Math.cos(angle) };
    });
  });
  const x = Math.min(...corners.map(point => point.x));
  const y = Math.min(...corners.map(point => point.y));
  return { x, y, width: Math.max(...corners.map(point => point.x)) - x, height: Math.max(...corners.map(point => point.y)) - y };
}

export function alignElements(elements, alignment, page) {
  const unlocked = elements.filter(element => !element.locked);
  if (!unlocked.length) return [];
  const group = unlocked.length === 1 ? { x: 0, y: 0, width: page.width, height: page.height } : boundingBox(unlocked);
  return unlocked.map(element => {
    const box = boundingBox([element]);
    const patch = {};
    if (alignment === 'left') patch.x = element.x + group.x - box.x;
    if (alignment === 'center') patch.x = element.x + group.x + group.width / 2 - box.x - box.width / 2;
    if (alignment === 'right') patch.x = element.x + group.x + group.width - box.x - box.width;
    if (alignment === 'top') patch.y = element.y + group.y - box.y;
    if (alignment === 'middle') patch.y = element.y + group.y + group.height / 2 - box.y - box.height / 2;
    if (alignment === 'bottom') patch.y = element.y + group.y + group.height - box.y - box.height;
    return { id: element.id, patch };
  });
}

export function distributeElements(elements, axis) {
  const list = elements.filter(element => !element.locked).map(element => ({ element, box: boundingBox([element]) })).sort((a, b) => a.box[axis] - b.box[axis]);
  if (list.length < 3) return [];
  const size = axis === 'x' ? 'width' : 'height';
  const first = list[0].box, last = list.at(-1).box;
  const gap = (last[axis] + last[size] - first[axis] - list.reduce((total, item) => total + item.box[size], 0)) / (list.length - 1);
  let position = first[axis];
  return list.map(({ element, box }) => {
    const patch = { [axis]: element[axis] + position - box[axis] };
    position += box[size] + gap;
    return { id: element.id, patch };
  });
}
