import { Pixels } from "../site/js/pixels.js";
import {
  portraitCandidate,
  compareMasks,
  limitUnsupportedAlpha,
} from "../site/js/selection.js";
import { refineEdges } from "../site/js/matting.js";

const passed = [];
function assert(ok, check) {
  if (!ok) throw Error(check);
  passed.push(check);
}
async function until(check, description) {
  const end = performance.now() + 45000;
  while (!check()) {
    if (performance.now() > end) throw Error("Timed out: " + description);
    await new Promise((r) => setTimeout(r, 30));
  }
}
function pixels(w, h) {
  const source = new OffscreenCanvas(w, h);
  source.getContext("2d").fillRect(0, 0, w, h);
  return new Pixels(source, new OffscreenCanvas(w, h));
}
function stroke(steps) {
  const p = pixels(64, 32);
  p.begin();
  for (let i = 0; i < steps; i++)
    p.brush(
      { x: 8 + (48 * i) / steps, y: 16 },
      { x: 8 + (48 * (i + 1)) / steps, y: 16 },
      14,
      1,
      false,
    );
  p.finish();
  return p.alpha;
}
function pixelTests() {
  const fast = stroke(1),
    slow = stroke(192);
  assert(
    fast.every((v, i) => slow[i] === v),
    "Soft brush coverage is independent of pointer frequency",
  );
  const p = pixels(1, 1);
  for (const target of [0, 255]) {
    for (let i = 0; i < 255; i++) {
      p.begin();
      p.mix(0, 0.04, target === 255);
      p.changed(p.full);
      p.finish();
    }
    assert(
      p.alpha[0] === target,
      "Repeated soft strokes reach alpha " + target,
    );
  }
  const width = 60,
    height = 60;
  const figure = new Uint8ClampedArray(width * height);
  for (let y = 8; y < 49; y++) {
    const half = y < 16 ? 4 : y < 35 ? 11 : 6;
    figure.fill(255, y * width + 30 - half, y * width + 30 + half);
  }
  assert(
    portraitCandidate(figure, width, height),
    "Standing subject with empty space below remains eligible for portrait refinement",
  );
  const box = new Uint8ClampedArray(width * height);
  for (let y = 28; y < 60; y++) box.fill(255, y * width + 4, y * width + 55);
  assert(
    !portraitCandidate(box, width, height),
    "Solid object touching bottom uses general segmentation",
  );
  assert(
    !compareMasks(box, new Uint8Array(box.length)).sameSubject,
    "Empty portrait proposal cannot replace a valid general mask",
  );
  const shiftedBox = box.slice();
  for (let y = 28; y < 60; y++) {
    shiftedBox.fill(0, y * width + 4, y * width + 14);
    shiftedBox.fill(255, y * width + 55, y * width + 60);
  }
  assert(
    compareMasks(box, shiftedBox).disputed,
    "Missing and extra foreground trigger a guided comparison",
  );
  assert(
    !compareMasks(box, box).disputed,
    "Matching masks skip the extra portrait pass",
  );
  const partialBox = box.slice();
  partialBox.fill(0, 0, width * 43);
  assert(
    !compareMasks(box, partialBox).disputed,
    "One-sided differences skip the extra portrait pass",
  );
  const guided = Uint8ClampedArray.of(230, 255, 205, 0);
  limitUnsupportedAlpha(guided, [0, 40, 200, 200], [0, 45, 10, 200]);
  assert(
    guided.join() === "0,40,205,0",
    "Guidance suppresses unsupported foreground and retains shared translucent edges",
  );
  const mask = new Uint8ClampedArray(45 * 5),
    rgb = new Uint8ClampedArray(mask.length * 4);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = i % 45 < 22 ? 0 : i % 45 === 22 ? 128 : 255;
    rgb.set([mask[i], 0, 255 - mask[i], 255], 4 * i);
  }
  const matte = refineEdges(mask, rgb, 45, 5);
  assert(
    matte.colors.length > 0,
    "Mixed red/blue edge produces foreground colour corrections",
  );
  const edge = matte.colors[0];
  const c = pixels(45, 5);
  c.frame.data.set(rgb);
  c.automatic(matte.alpha, matte.colors);
  assert(
    c.frame.data[edge * 4 + 2] < rgb[edge * 4 + 2],
    "Correction reduces blue background spill",
  );
  c.history(false);
  assert(
    c.frame.data[edge * 4 + 2] === rgb[edge * 4 + 2],
    "Undo restores source RGB",
  );
  c.history(true);
  c.begin();
  c.mix(edge, 1, true);
  c.changed(c.full);
  c.finish();
  assert(
    c.frame.data[edge * 4 + 2] === rgb[edge * 4 + 2] && c.alpha[edge] === 255,
    "Restore recovers source colour and alpha",
  );
}

const frame = document.querySelector("iframe");
const doc = () => frame.contentDocument;
const el = (id) => doc()?.getElementById(id);
async function reloadEditor() {
  const loaded = new Promise((resolve) =>
    frame.addEventListener("load", resolve, { once: true }),
  );
  frame.contentWindow.location.reload();
  await loaded;
}
const waitStatus = (text) =>
  until(() => {
    const status = el("status")?.textContent ?? "";
    if (/failed/i.test(status)) throw Error(status);
    return status.startsWith(text);
  }, text);
function rgba(canvas) {
  return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
    .data;
}
async function digest(canvas) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", rgba(canvas))),
  ).join(".");
}
function fileDrop(target, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  target.dispatchEvent(
    new DragEvent("drop", {
      dataTransfer: transfer,
      bubbles: true,
      cancelable: true,
    }),
  );
}
async function openPhoto(name, target) {
  const blob = await (await fetch("../examples/" + name + ".jpg")).blob();
  fileDrop(target, new File([blob], name + ".jpg", { type: "image/jpeg" }));
  await until(
    () => el("status")?.textContent && el("download").disabled,
    "export gated while inference runs",
  );
  assert(
    el("copy").disabled && el("download").disabled,
    "Copy and download wait for " + name,
  );
  await waitStatus("Done");
}
async function samples() {
  localStorage.setItem("delete.bg.language", "en");
  frame.src = "../site/";
  await until(() => el("zone")?.onclick, "landing page");
  const legacyKey = new URL("../site/vendor/u2netp.onnx", location.href).href;
  const cache = await caches.open("contour-assets-ort1.22-v1");
  await cache.put(legacyKey, new Response(new Uint8Array(4574861)));
  for (const [name, method] of [
    ["flower", "object"],
    ["locks", "portrait & hair"],
    ["wisps", "portrait & hair"],
  ]) {
    await openPhoto(name, doc().querySelector("header"));
    assert(
      el("status").textContent.endsWith(method),
      "Auto selects " + method + " for " + name,
    );
    if (name === "flower") {
      const stored = await cache.keys();
      assert(
        !(await cache.match(legacyKey)) &&
          stored.some((r) => r.url.includes("u2netp.onnx?sha256=")),
        "Same-size corrupt model is evicted and replaced",
      );
      assert(
        !stored.some((r) => r.url.includes("modnet.onnx")),
        "Flower processing skips the portrait download",
      );
    }
    const result = el("result"),
      actual = rgba(result);
    const reference = method === "object" ? "product" : "detail";
    const baseline = await createImageBitmap(
      await (
        await fetch("../examples/" + name + "-" + reference + ".png")
      ).blob(),
    );
    const preview = new OffscreenCanvas(baseline.width, baseline.height);
    preview.getContext("2d").drawImage(baseline, 0, 0);
    baseline.close();
    const expected = rgba(preview);
    let overlap = 0,
      union = 0,
      soft = 0;
    for (let i = 3; i < actual.length; i += 4) {
      const a = actual[i] > 127,
        b = expected[i] > 127;
      overlap += a && b;
      union += a || b;
      soft += actual[i] > 8 && actual[i] < 247;
    }
    assert(
      actual.length === expected.length && overlap / union > 0.9 && soft > 100,
      "Silhouette and semi-transparent edges retained for " + name,
    );
  }
}
async function editorTests() {
  const before = await digest(el("result"));
  const wide = new OffscreenCanvas(8193, 1);
  wide.getContext("2d").fillRect(0, 0, 1, 1);
  fileDrop(
    el("viewport"),
    new File([await wide.convertToBlob()], "wide.png", { type: "image/png" }),
  );
  await until(
    () => el("message").textContent.includes("too large"),
    "size guard",
  );
  assert(
    (await digest(el("result"))) === before,
    "Oversized input preserves the open photo",
  );
  el("undo").click();
  assert(
    (await digest(el("result"))) === (await digest(el("original"))),
    "Undo automatic cutout restores the source",
  );
  el("redo").click();
  assert(
    (await digest(el("result"))) === before,
    "Redo restores the exact colour-corrected cutout",
  );
  const result = el("result"),
    encode = result.toBlob.bind(result);
  result.toBlob = (cb) => cb(null);
  el("download").click();
  await until(() => el("message").textContent.includes("encode"), "failed PNG");
  let encoded;
  result.toBlob = (cb) =>
    encode((blob) => {
      encoded = blob;
      cb(blob);
    });
  el("download").click();
  await until(() => encoded, "PNG retry");
  assert(
    encoded.type === "image/png" && encoded.size > 0,
    "PNG encoding retries after a failed export",
  );
  const png = await createImageBitmap(encoded),
    exported = new OffscreenCanvas(png.width, png.height);
  exported.getContext("2d").drawImage(png, 0, 0);
  png.close();
  assert(
    (await digest(exported)) === before,
    "Export pixels match the result canvas",
  );

  await reloadEditor();
  await waitStatus("Draft restored");
  assert(
    (await digest(el("result"))) === before,
    "Reload restores alpha tiles and edge colours",
  );
  const other = frame.contentWindow.open(
    frame.contentWindow.location.href,
    "_blank",
  );
  try {
    await until(
      () =>
        other.document.getElementById("status")?.textContent ===
        "Draft restored",
      "duplicated tab",
    );
    const fork = other.document.getElementById("result");
    assert(
      (await digest(fork)) === before,
      "Duplicate tab starts with the same draft",
    );
    const key = "contour.tab./site/";
    assert(
      other.sessionStorage.getItem(key) !==
        frame.contentWindow.sessionStorage.getItem(key),
      "Duplicated tabs own different draft records",
    );
    other.document.getElementById("forget").click();
    await until(
      () => other.document.getElementById("forget").disabled,
      "forget in second tab",
    );
    await reloadEditor();
    await waitStatus("Draft restored");
    assert(
      (await digest(el("result"))) === before,
      "Deleting a duplicate draft preserves the first tab",
    );
  } finally {
    other.close();
  }
  el("forget").click();
  await until(() => el("forget").disabled, "delete saved draft");
  await reloadEditor();
  await until(
    () => el("empty") && !el("empty").hidden && el("open")?.onclick,
    "empty editor after deletion",
  );
  const selector = el("language");
  selector.value = "ru";
  selector.dispatchEvent(new Event("change"));
  assert(
    el("zone").textContent.includes("Выбрать фото"),
    "Empty editor switches to Russian",
  );
}
async function storageTests() {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open("contour./site/", 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const source = new OffscreenCanvas(8, 8);
  source.getContext("2d").fillRect(0, 0, 8, 8);
  const file = new File([await source.convertToBlob()], "legacy.png", {
    type: "image/png",
  });
  const mask = new Uint8ClampedArray(64).fill(128);
  const id = sessionStorage.getItem("contour.tab./site/");
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["files", "masks"], "readwrite");
    const files = tx.objectStore("files"),
      masks = tx.objectStore("masks");
    files.put({ file, date: Date.now() }, id);
    masks.put(mask, id);
    files.put({ file, date: 0 }, "expired");
    masks.put(mask, ["expired", 0]);
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
  localStorage.setItem("delete.bg.language", "en");
  await reloadEditor();
  await waitStatus("Draft restored");
  assert(
    rgba(el("result"))[3] === 128,
    "Legacy single-mask draft migrates with its original photo",
  );
  const count = await new Promise((resolve) => {
    const req = db
      .transaction("masks")
      .objectStore("masks")
      .count(["expired", 0]);
    req.onsuccess = () => resolve(req.result);
  });
  assert(count === 0, "Expired inactive draft tiles are removed on open");
  db.close();
  const store = await import("../site/js/draft.js");
  const p = pixels(8, 8);
  await store.saveFile(file, "first");
  await store.saveFile(file, "replacement");
  await store.saveEdit("first", p, p.full, false);
  const draft = await store.loadDraft();
  assert(
    draft.token === "replacement" && draft.tiles.length === 0,
    "Late mask writes cannot attach to a replacement file",
  );
  await store.deleteDraft();
}
try {
  pixelTests();
  await samples();
  await editorTests();
  await storageTests();
  await fetch("/result", { method: "POST", body: JSON.stringify({ passed }) });
} catch (error) {
  await fetch("/result", {
    method: "POST",
    body: JSON.stringify({ passed, error: String(error.stack || error) }),
  });
}
