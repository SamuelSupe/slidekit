export function rgba(color, opacity) {
  const channels = color.slice(1).match(/../g).map(value => parseInt(value, 16));
  return 'rgba(' + [...channels, opacity].join(',') + ')';
}

/** DrawingML angles run clockwise from the right; scaled angles use the fill's dimensions. */
export function gradientVector(gradient, width = 1, height = 1, rotation = 0) {
  const angle = gradient.angle * Math.PI / 180;
  let x = Math.cos(angle) * (gradient.scaled ? width : 1);
  let y = Math.sin(angle) * (gradient.scaled ? height : 1);
  if (!gradient.rotateWithShape) {
    const turn = -rotation * Math.PI / 180;
    [x, y] = [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)];
  }
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

export function gradientCss(gradient, width = 1, height = 1, rotation = 0) {
  const vector = gradientVector(gradient, width, height, rotation);
  const angle = Math.atan2(vector.y, vector.x) * 180 / Math.PI + 90;
  return 'linear-gradient(' + angle + 'deg,' + gradient.stops.map(stop => rgba(stop.color, stop.opacity) + ' ' + stop.offset * 100 + '%').join(',') + ')';
}

export function textGradientStyle(gradient) {
  return 'background-image:' + gradientCss(gradient) + ';background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;';
}

export function shadowCss(shadow, rotation) {
  let { offsetX: x, offsetY: y } = shadow;
  if (!shadow.rotateWithShape) {
    const turn = -rotation * Math.PI / 180;
    [x, y] = [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)];
  }
  return 'drop-shadow(' + x + 'px ' + y + 'px ' + shadow.blur / 2 + 'px ' + rgba(shadow.color, shadow.opacity) + ')';
}

export function blockArrowPoints(element) {
  const { shape, width, height } = element;
  const vertical = ['upArrow', 'downArrow', 'upDownArrow'].includes(shape);
  const double = shape === 'leftRightArrow' || shape === 'upDownArrow';
  const length = vertical ? height : width, breadth = vertical ? width : height;
  const head = Math.min(length / (double ? 2 : 1), Math.min(width, height) * (element.arrowHead ?? 0.5));
  const shaft = breadth * (element.arrowShaft ?? 0.5);
  const top = (breadth - shaft) / 2, bottom = (breadth + shaft) / 2;
  const points = [[double ? head : 0, top], [length - head, top], [length - head, 0], [length, breadth / 2], [length - head, breadth], [length - head, bottom], [double ? head : 0, bottom]];
  if (double) points.push([head, breadth], [0, breadth / 2], [head, 0]);
  return points.map(([x, y]) => {
    if (shape === 'leftArrow') x = length - x;
    if (shape === 'upArrow') return [y, length - x];
    return vertical ? [y, x] : [x, y];
  });
}
