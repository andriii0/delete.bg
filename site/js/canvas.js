import { $ } from "./input.js";
import { shape } from "./pixels.js";

export class CanvasView {
  constructor(onStart, onCommit, resumeProcessing) {
    this.onStart = onStart;
    this.onCommit = onCommit;
    this.resumeProcessing = resumeProcessing;
    this.viewport = $("viewport");
    this.stage = $("stage");
    this.mode = "pan";
    this.tool = "brush";
    this.view = "result";
    this.bg = "check";
    this.zoom = "fit";
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    const v = this.viewport;
    this.touches = new Map();
    v.onpointerleave = () => {
      this.overPhoto = false;
      this.overlay();
    };
    v.onpointerdown = (e) => this.down(e);
    v.onpointermove = (e) => this.move(e);
    v.onpointerup = (e) => this.up(e);
    v.onpointercancel = v.onlostpointercapture = (e) => {
      this.touches.delete(e.pointerId);
      if (!this.touches.size) this.pinching = false;
      if (this.gesture?.id === e.pointerId) this.cancel();
    };
    v.addEventListener(
      "wheel",
      (e) => {
        if (!this.pixels || !e.deltaY) return;
        e.preventDefault();
        if (this.gesture) return;
        const unit =
          e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? v.clientHeight : 1;
        const delta = Math.max(-360, Math.min(360, e.deltaY * unit));
        const fit = this.fitScale();
        const scale = Math.max(
          Math.min(0.05, fit),
          Math.min(Math.max(8, fit), this.scale * Math.exp(-delta / 600)),
        );
        if (scale === this.scale) return;
        const point = this.point(e);
        const x = Math.max(0, Math.min(this.pixels.width, point.x));
        const y = Math.max(0, Math.min(this.pixels.height, point.y));
        this.setZoom(
          String(scale),
          this.x + x * this.scale,
          this.y + y * this.scale,
        );
      },
      { passive: false },
    );
    new ResizeObserver(() => this.resize()).observe(v);
    document.addEventListener("keydown", (e) => {
      if (
        e.code === "Space" &&
        (e.target === v ||
          (v.matches(":hover") &&
            !["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)))
      ) {
        e.preventDefault();
        this.space = true;
      }
      if (e.key === "Escape") {
        this.cancel();
        this.setMode("pan");
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.space = false;
    });
    window.addEventListener("blur", () => {
      this.space = false;
      this.cancel();
    });
    for (const [attribute, action] of Object.entries({
      view: (value) => {
        this.cancel();
        this.view = value;
        this.render();
      },
      bg: (value) => {
        this.bg = value;
        this.render();
      },
      zoom: (value) => {
        this.cancel();
        this.setZoom(value);
      },
      mode: (value) => this.setMode(value),
      tool: (value) => {
        this.cancel();
        this.tool = value;
        this.setMode(this.mode === "pan" ? "erase" : this.mode);
      },
    }))
      for (const el of document.querySelectorAll("[data-" + attribute + "]"))
        el.onclick = () => action(el.dataset[attribute]);
    $("pan").onclick = () => this.setMode("pan");
    $("diameter").oninput = $("softness").oninput = () => {
      this.render();
    };
    for (const event of ["pointerenter", "focus", "pointerleave", "blur"])
      $("diameter").addEventListener(event, () => this.overlay());
  }
  attach(pixels) {
    this.cancel();
    this.pixels = pixels;
    this.last = null;
    this.overPhoto = false;
    this.touches.clear();
    this.pinching = false;
    this.mode = "pan";
    this.view = "result";
    this.zoom = "fit";
    Object.assign(this.stage.style, {
      width: pixels.width + "px",
      height: pixels.height + "px",
    });
    this.resize();
    this.render();
  }
  resize() {
    const v = this.viewport,
      overlay = $("outline");
    overlay.width = v.clientWidth;
    overlay.height = v.clientHeight;
    if (this.pixels) this.setZoom(this.zoom);
  }
  fitScale() {
    return Math.max(
      0.001,
      Math.min(
        (this.viewport.clientWidth - 16) / this.pixels.width,
        (this.viewport.clientHeight - 16) / this.pixels.height,
      ),
    );
  }
  setZoom(
    zoom,
    cx = this.viewport.clientWidth / 2,
    cy = this.viewport.clientHeight / 2,
  ) {
    const { width, height } = this.pixels;
    const focusX = (cx - this.x) / this.scale,
      focusY = (cy - this.y) / this.scale;
    this.zoom = zoom;
    this.scale = zoom === "fit" ? this.fitScale() : Number(zoom);
    this.x = cx - (zoom === "fit" ? width / 2 : focusX) * this.scale;
    this.y = cy - (zoom === "fit" ? height / 2 : focusY) * this.scale;
    this.position();
    this.render();
  }
  position() {
    const clamp = (offset, screen, image) => {
      const visible = Math.min(16, screen / 2, image / 2);
      return Math.max(visible - image, Math.min(screen - visible, offset));
    };
    this.x = clamp(
      this.x,
      this.viewport.clientWidth,
      this.pixels.width * this.scale,
    );
    this.y = clamp(
      this.y,
      this.viewport.clientHeight,
      this.pixels.height * this.scale,
    );
    this.stage.style.transform =
      "translate(" + this.x + "px," + this.y + "px) scale(" + this.scale + ")";
    this.overlay();
  }
  setMode(mode) {
    this.cancel();
    this.mode = mode;
    this.view = "result";
    this.render();
  }
  render() {
    const level = $("zoom-level");
    level.hidden = ["fit", "1", "2"].includes(this.zoom);
    level.textContent = Math.round(this.scale * 100) + "%";
    for (const key of ["mode", "tool", "bg", "zoom", "view"])
      for (const el of document.querySelectorAll("[data-" + key + "]"))
        el.setAttribute("aria-pressed", el.dataset[key] === this[key]);
    $("pan").setAttribute("aria-pressed", this.mode === "pan");
    $("original").style.opacity =
      this.view === "original" ? "1" : this.mode === "restore" ? "0.25" : "0";
    $("result").hidden = this.view === "original";
    this.stage.className = this.bg;
    $("brush-settings").hidden = this.tool !== "brush";
    $("size-label").textContent = $("diameter").value + " px";
    $("soft-label").textContent = $("softness").value + "%";
    const editing = this.mode !== "pan" && this.view === "result";
    this.viewport.classList.toggle("edit", editing);
    this.viewport.classList.toggle("brush", editing && this.tool === "brush");
    this.overlay();
  }
  point(e) {
    const rect = this.viewport.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.x) / this.scale,
      y: (e.clientY - rect.top - this.y) / this.scale,
    };
  }
  inside(p) {
    return (
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < this.pixels.width &&
      p.y < this.pixels.height
    );
  }
  overlay() {
    if (!this.pixels) return;
    const ring = $("ring"),
      outline = $("outline"),
      ctx = outline.getContext("2d");
    ctx.clearRect(0, 0, outline.width, outline.height);
    const editing = this.mode !== "pan" && this.view === "result";
    const preview = $("diameter").matches(":hover, :focus");
    ring.hidden = !(
      editing &&
      this.tool === "brush" &&
      !this.pinching &&
      (this.overPhoto || preview)
    );
    if (!ring.hidden) {
      const centre = (origin, length, limit) =>
        (Math.max(0, origin) + Math.min(limit, origin + length * this.scale)) /
        2;
      const x = this.last
        ? this.x + this.last.x * this.scale
        : centre(this.x, this.pixels.width, outline.width);
      const y = this.last
        ? this.y + this.last.y * this.scale
        : centre(this.y, this.pixels.height, outline.height);
      const size = Number($("diameter").value) * this.scale + "px";
      Object.assign(ring.style, {
        left: x + "px",
        top: y + "px",
        width: size,
        height: size,
      });
    }
    if (this.gesture?.type === "shape") {
      const { path } = shape(this.tool, this.gesture.points);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.scale, this.scale);
      ctx.strokeStyle = "#142e25";
      ctx.lineWidth = 3 / this.scale;
      ctx.stroke(path);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1 / this.scale;
      ctx.setLineDash([4 / this.scale, 3 / this.scale]);
      ctx.stroke(path);
      ctx.restore();
    }
  }
  down(e) {
    if (!this.pixels || ![0, 1].includes(e.button)) return;
    if (e.pointerType === "touch") {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.viewport.setPointerCapture(e.pointerId);
      if (this.touches.size > 1) {
        const interrupted = this.gesture?.interrupted;
        this.cancel();
        this.pinching = true;
        this.pinch = this.pinchGeometry();
        this.overlay();
        if (interrupted) this.resumeProcessing();
        return;
      }
    }
    if (this.gesture || this.pinching) return;
    const p = this.point(e);
    const pan =
      e.button === 1 ||
      this.space ||
      this.mode === "pan" ||
      this.view === "original";
    e.preventDefault();
    this.viewport.focus({ preventScroll: true });
    this.viewport.setPointerCapture(e.pointerId);
    const type = pan ? "pan" : this.tool === "brush" ? "brush" : "shape";
    this.gesture = {
      id: e.pointerId,
      type,
      points: [p],
      cx: e.clientX,
      cy: e.clientY,
    };
    if (!pan && e.pointerType !== "touch") this.startEdit();
    this.overlay();
  }
  startEdit() {
    const g = this.gesture;
    g.interrupted = this.onStart();
    g.started = true;
    this.pixels.begin();
    if (g.type === "brush") {
      const p = g.points[0];
      if (this.inside(p)) this.last = p;
      this.stroke(p, p);
    }
  }
  stroke(a, b) {
    this.pixels.brush(
      a,
      b,
      Number($("diameter").value),
      Number($("softness").value) / 100,
      this.mode === "restore",
    );
  }
  pinchGeometry() {
    const [a, b] = this.touches.values();
    const rect = this.viewport.getBoundingClientRect();
    return {
      x: (a.x + b.x) / 2 - rect.left,
      y: (a.y + b.y) / 2 - rect.top,
      span: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  }
  move(e) {
    if (!this.pixels) return;
    if (this.touches.has(e.pointerId))
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinching) {
      if (this.touches.size !== 2) return;
      const next = this.pinchGeometry(),
        previous = this.pinch,
        fit = this.fitScale();
      const scale = Math.max(
        Math.min(0.05, fit),
        Math.min(Math.max(8, fit), (this.scale * next.span) / previous.span),
      );
      this.x = next.x - ((previous.x - this.x) * scale) / this.scale;
      this.y = next.y - ((previous.y - this.y) * scale) / this.scale;
      this.scale = scale;
      this.zoom = String(scale);
      this.pinch = next;
      this.position();
      this.render();
      return;
    }
    const g = this.gesture,
      p = this.point(e);
    if (g && g.id !== e.pointerId) return;
    this.overPhoto = this.inside(p);
    if (g?.type === "pan") {
      this.x += e.clientX - g.cx;
      this.y += e.clientY - g.cy;
      g.cx = e.clientX;
      g.cy = e.clientY;
      this.position();
      return;
    }
    if (g && !g.started) {
      if (Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 3) return;
      this.startEdit();
    }
    if (
      this.tool === "brush" &&
      this.mode !== "pan" &&
      this.view === "result" &&
      this.inside(p)
    )
      this.last = p;
    if (g?.type === "brush") {
      this.stroke(g.points[0], p);
      g.points[0] = p;
    }
    if (g?.type === "shape") {
      if (this.tool === "lasso") g.points.push(p);
      else g.points[1] = p;
    }
    this.overlay();
  }
  up(e) {
    this.touches.delete(e.pointerId);
    if (this.pinching) {
      if (!this.touches.size) this.pinching = false;
      else if (this.touches.size === 2) this.pinch = this.pinchGeometry();
      this.overlay();
      return;
    }
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    if (g.type !== "pan" && !g.started) this.startEdit();
    this.move(e);
    if (g.type === "shape")
      this.pixels.fill(this.tool, g.points, this.mode === "restore");
    this.gesture = null;
    if (g.type !== "pan") {
      const edit = this.pixels.finish();
      if (edit) this.onCommit(edit);
    }
    this.overlay();
  }
  cancel() {
    if (this.gesture?.started) this.pixels.finish(true);
    this.gesture = null;
    this.overlay();
  }
}
