import Moveable from 'moveable';
import Selecto from 'selecto';
import { positionElement } from './render.js';

export class Gestures {
  constructor(owner) {
    this.owner = owner;
    this.drafts = new Map();
    this.origins = new Map();
    this.moveable = new Moveable(owner.world, {
      container: owner.world,
      rootContainer: owner.root,
      draggable: true, resizable: true, rotatable: true, origin: false,
      snappable: true, snapThreshold: 6, snapDirections: { left: true, top: true, right: true, bottom: true, center: true, middle: true },
      elementSnapDirections: { left: true, top: true, right: true, bottom: true, center: true, middle: true },
      isDisplaySnapDigit: false, throttleDrag: 0, throttleResize: 0, throttleRotate: 0,
      padding: { left: 0, top: 0, right: 0, bottom: 0 },
      checkInput: true,
    });
    for (const operation of ['drag', 'resize', 'rotate']) {
      this.moveable.on(operation + 'Start', event => this.begin(operation, event));
      this.moveable.on(operation, event => this.move(operation, event));
      this.moveable.on(operation + 'End', () => this.finish());
      this.moveable.on(operation + 'GroupStart', event => event.events.forEach(child => this.begin(operation, child)));
      this.moveable.on(operation + 'Group', event => event.events.forEach(child => this.move(operation, child)));
      this.moveable.on(operation + 'GroupEnd', () => this.finish());
    }
    this.selecto = new Selecto({
      container: owner.viewport, dragContainer: owner.viewport,
      rootContainer: owner.viewport,
      selectableTargets: [], selectByClick: true, selectFromInside: false,
      toggleContinueSelect: ['shift'], hitRate: 0, ratio: 0,
      keyContainer: owner.root,
    });
    this.selecto.on('dragStart', event => {
      const target = event.inputEvent.target;
      const element = target.closest?.('[data-element-id]');
      if (owner.store.mode !== 'edit' || owner.text.id || this.moveable.isMoveableElement(target) ||
          (element && owner.store.selected.includes(element.dataset.elementId) && !event.inputEvent.shiftKey)) event.stop();
    });
    this.selecto.on('selectEnd', event => {
      if (owner.store.mode !== 'edit') return;
      owner.store.selectElements(event.selected.map(node => node.dataset.elementId));
    });
    owner.viewport.addEventListener('mousedown', event => {
      if (event.button !== 0 || event.shiftKey || owner.text.id || owner.store.mode !== 'edit') return;
      const node = event.target.closest?.('.sk-element');
      if (!node || node.dataset.locked === 'true' || owner.store.selected.includes(node.dataset.elementId)) return;
      owner.store.selectElements([node.dataset.elementId]);
      // Register the new target before the same mousedown reaches Moveable.
      // An asynchronous Selecto handoff can miss the beginning of fast drags.
      this.moveable.forceUpdate();
    }, { capture: true, signal: owner.abort.signal });
  }
  begin(operation, event) {
    if (this.owner.store.mode !== 'edit' || this.owner.text.id) { event.stop(); return; }
    const element = this.owner.store.slide.elements.find(item => item.id === event.target.dataset.elementId);
    if (!element || element.locked) { event.stop(); return; }
    this.owner.root.focus({ preventScroll: true });
    this.origins.set(element.id, element);
    if (operation === 'drag') event.set([element.x, element.y]);
    else {
      event.dragStart && event.dragStart.set([element.x, element.y]);
      if (operation === 'resize') {
        event.set([element.width, element.height]);
        event.setMin([12, 12]);
        this.moveable.keepRatio = !!event.inputEvent?.shiftKey;
      } else event.set(element.rotation);
    }
  }
  move(operation, event) {
    const id = event.target.dataset.elementId;
    const original = this.origins.get(id);
    if (!original) return;
    const next = { ...original };
    const translate = operation === 'drag' ? event.beforeTranslate : event.drag?.beforeTranslate;
    if (translate) [next.x, next.y] = translate;
    if (operation === 'resize') { next.width = Math.max(1, event.width); next.height = Math.max(1, event.height); }
    if (operation === 'rotate') next.rotation = event.beforeRotation;
    this.drafts.set(id, next);
    positionElement(event.target, next);
  }
  finish() {
    const updates = [...this.drafts.values()].map(element => ({
      id: element.id,
      patch: { x: element.x, y: element.y, width: element.width, height: element.height, rotation: element.rotation },
    }));
    this.drafts.clear();
    this.origins.clear();
    if (updates.length) this.owner.run(() => this.owner.store.updateElements(updates));
  }
  refresh() {
    const { owner, moveable, selecto } = this;
    if (!moveable || owner.destroyed || moveable.isDragging()) return;
    const editable = owner.store.mode === 'edit' && !owner.text.id;
    const selectable = [...owner.canvas.querySelectorAll('.sk-element')].filter(node => node.dataset.locked !== 'true');
    const selected = editable ? selectable.filter(node => owner.store.selected.includes(node.dataset.elementId)) : [];
    // Measure only after the target update; measuring the previous target can
    // enqueue stale geometry that interrupts the first drag on a new selection.
    moveable.setState({
      target: selected,
      zoom: 1 / owner.zoom,
      verticalGuidelines: [0, owner.store.doc.width / 2, owner.store.doc.width],
      horizontalGuidelines: [0, owner.store.doc.height / 2, owner.store.doc.height],
      elementGuidelines: selectable.filter(node => !selected.includes(node)),
    }, () => {
      if (!owner.destroyed && !moveable.isDragging()) moveable.updateRect();
    });
    selecto.selectableTargets = editable ? selectable : [];
    selecto.setSelectedTargets(selected);
  }
  destroy() {
    this.moveable.destroy();
    this.selecto.destroy();
    this.drafts.clear();
    this.origins.clear();
  }
}
