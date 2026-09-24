export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.clear();
  }
  record(before, group = null) {
    const now = Date.now();
    if (!group || group !== this.group || now - this.time > 700) {
      this.past.push(before);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.group = group;
    this.time = now;
    this.future = [];
  }
  undo(current) {
    if (!this.past.length) return null;
    this.future.push(current);
    this.group = null;
    return this.past.pop();
  }
  redo(current) {
    if (!this.future.length) return null;
    this.past.push(current);
    this.group = null;
    return this.future.pop();
  }
  clear() {
    this.past = [];
    this.future = [];
    this.group = null;
    this.time = 0;
  }
}
