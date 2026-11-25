export class Pixels {
  constructor(source, target, saved) {
    this.width = source.width;
    this.height = source.height;
    this.ctx = target.getContext("2d");
    this.frame = source
      .getContext("2d")
      .getImageData(0, 0, this.width, this.height);
    this.original = new Uint8ClampedArray(this.width * this.height);
    for (let i = 0; i < this.original.length; i++)
      this.original[i] = this.frame.data[4 * i + 3];
    this.alpha =
      saved?.mask?.length === this.original.length
        ? saved.mask
        : this.original.slice();
    for (const { x, y, w, data } of saved?.tiles ?? []) {
      for (let offset = 0; offset < data.length; offset += w)
        this.alpha.set(
          data.subarray(offset, offset + w),
          (y + offset / w) * this.width + x,
        );
    }
    this.colors = saved?.colors ?? new Uint32Array();
    this.undo = [];
    this.redo = [];
    this.full = { x: 0, y: 0, w: this.width, h: this.height };
    this.draw(this.full);
  }
  bounds(left, top, right, bottom) {
    const x = Math.max(0, Math.floor(left)),
      y = Math.max(0, Math.floor(top));
    return {
      x,
      y,
      w: Math.max(0, Math.min(this.width, Math.ceil(right)) - x),
      h: Math.max(0, Math.min(this.height, Math.ceil(bottom)) - y),
    };
  }
  draw({ x, y, w, h }) {
    if (!w || !h) return;
    for (let row = y; row < y + h; row++) {
      const end = row * this.width + x + w;
      for (let i = end - w; i < end; i++)
        this.frame.data[4 * i + 3] = this.alpha[i];
    }
    this.drawColors(x, y, w, h);
    this.ctx.putImageData(this.frame, 0, 0, x, y, w, h);
  }
  drawColors(x, y, w, h) {
    const colors = this.colors;
    const start = y * this.width + x,
      end = (y + h - 1) * this.width + x + w;
    let lo = 0,
      hi = colors.length / 3;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (colors[mid * 3] < start) lo = mid + 1;
      else hi = mid;
    }
    for (let j = lo * 3; j < colors.length && colors[j] < end; j += 3) {
      const i = colors[j],
        col = i % this.width;
      if (col < x || col >= x + w) continue;
      const opacity = this.original[i] ? this.alpha[i] / this.original[i] : 1;
      for (let c = 0; c < 3; c++) {
        const source = (colors[j + 1] >>> (8 * c)) & 255;
        const foreground = (colors[j + 2] >>> (8 * c)) & 255;
        this.frame.data[i * 4 + c] =
          source + (1 - opacity) * (foreground - source);
      }
    }
  }
  setColors(colors) {
    for (let j = 0; j < this.colors.length; j += 3)
      for (let c = 0; c < 3; c++)
        this.frame.data[4 * this.colors[j] + c] =
          (this.colors[j + 1] >>> (8 * c)) & 255;
    this.colors = colors;
  }
  begin() {
    this.before = this.alpha.slice();
    this.beforeColors = this.colors;
    this.dirty = null;
  }
  changed(box) {
    if (!box.w || !box.h) return;
    const d = this.dirty;
    this.dirty = d
      ? this.bounds(
          Math.min(d.x, box.x),
          Math.min(d.y, box.y),
          Math.max(d.x + d.w, box.x + box.w),
          Math.max(d.y + d.h, box.y + box.h),
        )
      : box;
    this.draw(box);
  }
  finish(cancel = false) {
    const box = this.dirty,
      before = this.before;
    const colors =
      this.beforeColors !== this.colors
        ? [this.beforeColors, this.colors]
        : null;
    this.beforeColors = null;
    this.before = null;
    this.dirty = null;
    if (!before || !box) return false;
    if (cancel) {
      this.alpha = before;
      this.draw(box);
      return false;
    }
    const { x, y, w, h } = box;
    const delta = new Uint8Array(w * h);
    let different = false;
    for (let row = 0; row < h; row++)
      for (let col = 0; col < w; col++) {
        const i = (row + y) * this.width + x + col;
        const v = before[i] ^ this.alpha[i];
        delta[row * w + col] = v;
        if (v) different = true;
      }
    if (!different && !colors) return false;
    this.redo = [];
    const bytesUsed =
      delta.length + (colors?.reduce((n, a) => n + a.byteLength, 0) ?? 0);
    this.undo.push({ box, delta, colors, bytesUsed });
    let bytes = this.undo.reduce((sum, e) => sum + e.bytesUsed, 0);
    while (this.undo.length > 1 && bytes > 96 * 1024 * 1024)
      bytes -= this.undo.shift().bytesUsed;
    return this.undo.at(-1);
  }
  history(forward) {
    const from = forward ? this.redo : this.undo,
      to = forward ? this.undo : this.redo;
    const entry = from.pop();
    if (!entry) return false;
    const { x, y, w, h } = entry.box;
    for (let row = 0; row < h; row++)
      for (let col = 0; col < w; col++)
        this.alpha[(y + row) * this.width + x + col] ^=
          entry.delta[row * w + col];
    if (entry.colors) this.setColors(entry.colors[forward ? 1 : 0]);
    this.draw(entry.box);
    to.push(entry);
    return entry;
  }
  automatic(matte, colors) {
    this.begin();
    this.setColors(colors ?? new Uint32Array());
    for (let i = 0; i < matte.length; i++)
      this.alpha[i] = (this.original[i] * matte[i]) / 255;
    this.changed(this.full);
    return this.finish();
  }
  mix(i, coverage, restore) {
    const target = restore ? this.original[i] : 0;
    const base = this.before[i];
    // Round toward the target so successive light strokes can reach either endpoint.
    // Monotonic updates retain the strongest coverage in this gesture.
    const amount = Math.ceil(Math.abs(target - base) * coverage);
    this.alpha[i] = restore
      ? Math.max(this.alpha[i], base + amount)
      : Math.min(this.alpha[i], base - amount);
  }
  brush(a, b, diameter, softness, restore) {
    const r = diameter / 2,
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = dx * dx + dy * dy;
    const box = this.bounds(
      Math.min(a.x, b.x) - r - 1,
      Math.min(a.y, b.y) - r - 1,
      Math.max(a.x, b.x) + r + 1,
      Math.max(a.y, b.y) + r + 1,
    );
    const feather = Math.max(1, r * softness);
    for (let y = box.y; y < box.y + box.h; y++)
      for (let x = box.x; x < box.x + box.w; x++) {
        const xx = x + 0.5 - a.x,
          yy = y + 0.5 - a.y;
        const t = len ? Math.max(0, Math.min(1, (xx * dx + yy * dy) / len)) : 0;
        const distance = Math.hypot(xx - t * dx, yy - t * dy);
        const coverage = Math.max(
          0,
          Math.min(1, (r + 0.5 - distance) / feather),
        );
        if (coverage) this.mix(y * this.width + x, coverage, restore);
      }
    this.changed(box);
  }
  fill(tool, points, restore) {
    const { path, left, top, right, bottom } = shape(tool, points);
    const box = this.bounds(left - 1, top - 1, right + 1, bottom + 1);
    if (!box.w || !box.h) return;
    const ctx = new OffscreenCanvas(box.w, box.h).getContext("2d");
    ctx.translate(-box.x, -box.y);
    ctx.fill(path, "evenodd");
    const selection = ctx.getImageData(0, 0, box.w, box.h).data;
    for (let y = 0; y < box.h; y++)
      for (let x = 0; x < box.w; x++) {
        const coverage = selection[(y * box.w + x) * 4 + 3] / 255;
        if (coverage)
          this.mix((box.y + y) * this.width + box.x + x, coverage, restore);
      }
    this.changed(box);
  }
}

export function shape(tool, points) {
  const a = points[0],
    b = points.at(-1),
    path = new Path2D();
  let left = Math.min(a.x, b.x),
    top = Math.min(a.y, b.y),
    right = Math.max(a.x, b.x),
    bottom = Math.max(a.y, b.y);
  if (tool === "rect") path.rect(left, top, right - left, bottom - top);
  else if (tool === "circle") {
    const r = Math.hypot(a.x - b.x, a.y - b.y);
    path.arc(a.x, a.y, r, 0, 2 * Math.PI);
    left = a.x - r;
    right = a.x + r;
    top = a.y - r;
    bottom = a.y + r;
  } else {
    path.moveTo(a.x, a.y);
    for (const p of points) {
      path.lineTo(p.x, p.y);
      left = Math.min(left, p.x);
      right = Math.max(right, p.x);
      top = Math.min(top, p.y);
      bottom = Math.max(bottom, p.y);
    }
    path.closePath();
  }
  return { path, left, top, right, bottom };
}
