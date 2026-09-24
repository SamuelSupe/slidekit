import { at, attr, children, numeric } from './pptx-package.js';

/** Read open polylines in normalized shape coordinates, including Office elbows. */
export function readConnectorPoints(properties) {
  const geometry = at(properties, 'prstGeom');
  const preset = attr(geometry, 'prst');
  let points;
  if (/^bentConnector[2-5]$/.test(preset)) {
    const adjustments = { adj1: 0.5, adj2: 0.5, adj3: 0.5 };
    for (const guide of children(at(geometry, 'avLst'), 'gd')) {
      const name = attr(guide, 'name');
      if (!Object.hasOwn(adjustments, name)) continue;
      const value = /^val\s+(-?[\d.]+)$/.exec(attr(guide, 'fmla'));
      if (!value) return null;
      adjustments[name] = Number(value[1]) / 100000;
    }
    const { adj1: x1, adj2: y2, adj3: x3 } = adjustments;
    // ECMA-376 preset paths use one, two or three independent bend guides.
    points = {
      bentConnector2: [[0, 0], [1, 0], [1, 1]],
      bentConnector3: [[0, 0], [x1, 0], [x1, 1], [1, 1]],
      bentConnector4: [[0, 0], [x1, 0], [x1, y2], [1, y2], [1, 1]],
      bentConnector5: [[0, 0], [x1, 0], [x1, y2], [x3, y2], [x3, 1], [1, 1]],
    }[preset].map(([x, y]) => ({ x, y }));
  } else {
    const paths = children(at(properties, 'custGeom/pathLst'), 'path');
    if (paths.length !== 1 || attr(paths[0], 'fill') !== 'none') return null;
    const path = paths[0], commands = children(path);
    const width = numeric(path, 'w'), height = numeric(path, 'h');
    if (width <= 0 || height <= 0 || commands.some((command, index) => command.localName !== (index ? 'lnTo' : 'moveTo'))) return null;
    points = commands.map(command => ({ x: numeric(at(command, 'pt'), 'x', NaN) / width, y: numeric(at(command, 'pt'), 'y', NaN) / height }));
  }
  if (points.length < 2 || points.length > 32 || points.some(point => ![point.x, point.y].every(value => Number.isFinite(value) && Math.abs(value) <= 100000))) return null;
  return points;
}
