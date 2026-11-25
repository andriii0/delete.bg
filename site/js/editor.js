import { $, bindInput, message } from "./input.js";
import { deleteDraft, loadDraft, saveFile, saveEdit } from "./draft.js";
import { showText, translate } from "./language.js";
import { Pixels } from "./pixels.js";
import { CanvasView } from "./canvas.js";

let pixels,
  filename,
  worker,
  selection = 0,
  request = 0,
  blobPromise,
  token,
  processing = false,
  persist = true;
const view = new CanvasView(
  () => {
    const interrupted = processing;
    stop("Manual editing");
    return interrupted;
  },
  changed,
  processPhoto,
);
const status = (text) => showText($("status"), text);
const methodLabel = (kind) =>
  translate(kind === "product" ? "object" : "portrait & hair");
function stop(text) {
  request++;
  worker?.terminate();
  worker = null;
  processing = false;
  $("copy").disabled = $("download").disabled = !pixels;
  $("progress").hidden = true;
  if (text) status(text);
}
function historyButtons() {
  $("undo").disabled = !pixels?.undo.length;
  $("redo").disabled = !pixels?.redo.length;
}
function changed(edit) {
  blobPromise = null;
  historyButtons();
  if (persist)
    saveEdit(token, pixels, edit.box, Boolean(edit.colors)).catch(() =>
      message("Draft could not be saved. Download your PNG before closing."),
    );
}
function history(forward) {
  if (!(forward ? pixels?.redo.length : pixels?.undo.length)) return;
  view.cancel();
  stop();
  const edit = pixels.history(forward);
  if (edit) {
    changed(edit);
    status(forward ? "Edit redone" : "Edit undone");
  }
}
$("undo").onclick = () => history(false);
$("redo").onclick = () => history(true);
async function processPhoto() {
  if (!pixels) return;
  view.cancel();
  stop();
  const ticket = request;
  processing = true;
  $("copy").disabled = $("download").disabled = true;
  const kind = $("method").value;
  status("Preparing model…");
  let bitmap;
  try {
    bitmap = await createImageBitmap($("original"));
    if (ticket !== request) {
      bitmap.close();
      return;
    }
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    const failure = (detail, values) => {
      if (ticket !== request) return;
      stop();
      status(() =>
        [
          translate("Processing failed."),
          translate(detail, values),
          translate("Edit manually or choose Apply to retry."),
        ].join(" "),
      );
    };
    worker.onerror = () => failure("The processing worker could not load.");
    worker.onmessage = ({ data }) => {
      if (ticket !== request) return;
      const bar = $("progress");
      if (data.stage === "download") {
        bar.hidden = false;
        bar.max = data.total;
        bar.value = data.loaded;
        status(() =>
          translate("Downloading {asset} · {loaded} of {total} MB", {
            asset: data.asset,
            loaded: data.loaded / 1e6,
            total: data.total / 1e6,
          }),
        );
      } else if (data.stage === "process") {
        bar.hidden = false;
        bar.removeAttribute("value");
        status(() =>
          translate("Processing on CPU · {method}", {
            method: methodLabel(data.kind),
          }),
        );
      } else if (data.stage === "done") {
        stop();
        const edit = pixels.automatic(data.alpha, data.colors);
        if (edit) changed(edit);
        status(() =>
          translate("Done · {method}", { method: methodLabel(data.method) }),
        );
      } else if (data.stage === "error")
        failure(data.template ?? data.message, data.values);
    };
    worker.postMessage({ image: bitmap, kind }, [bitmap]);
  } catch (e) {
    bitmap?.close();
    if (ticket === request) {
      stop();
      status(() =>
        [
          translate("Model failed to start."),
          translate("You can still edit manually."),
        ].join(" "),
      );
    }
  }
}
$("run").onclick = processPhoto;
async function openPhoto(file, saved) {
  const generation = ++selection;
  let image;
  try {
    image = await createImageBitmap(file);
  } catch {
    if (generation === selection)
      message("Could not open that image. Try a JPG, PNG or WebP.");
    return;
  }
  if (generation !== selection) {
    image.close();
    return;
  }
  if (
    image.width * image.height > 16 * 1024 * 1024 ||
    Math.max(image.width, image.height) > 8192
  ) {
    image.close();
    message(
      "Image too large. Resize to 16 megapixels or less, with neither side over 8192 px.",
    );
    return;
  }
  stop();
  view.cancel();
  message("");
  blobPromise = null;
  const original = document.createElement("canvas");
  const result = document.createElement("canvas");
  for (const canvas of [original, result]) {
    canvas.width = image.width;
    canvas.height = image.height;
  }
  try {
    original
      .getContext("2d", { willReadFrequently: true })
      .drawImage(image, 0, 0);
    pixels = new Pixels(original, result, saved);
  } catch {
    message("Not enough memory. Try a smaller photo.");
    return;
  } finally {
    image.close();
  }
  $("original").replaceWith(original);
  $("result").replaceWith(result);
  original.id = "original";
  result.id = "result";
  filename = file.name || "photo.png";
  $("empty").hidden = true;
  $("studio").hidden = false;
  $("copy").disabled = false;
  $("download").disabled = false;
  $("file-info").textContent =
    filename + " · " + pixels.width + " × " + pixels.height;
  view.attach(pixels);
  historyButtons();
  $("method").value = "auto";
  persist = true;
  token = saved?.token ?? crypto.randomUUID();
  $("forget").disabled = false;
  if (!saved) {
    saveFile(file, token).catch(() => {
      if (generation === selection) {
        persist = false;
        message(
          "Draft storage is unavailable. Download your PNG before closing.",
        );
      }
    });
  }
  if (saved?.tiles?.length || saved?.mask?.length === pixels.alpha.length)
    status("Draft restored");
  else await processPhoto();
}
bindInput((file) => openPhoto(file));
$("forget").onclick = async () => {
  persist = false;
  const generation = selection;
  try {
    await deleteDraft();
    if (generation !== selection) return;
    $("forget").disabled = true;
    message(
      "Saved draft deleted. This photo will stay in this tab until you close or refresh it.",
    );
  } catch {
    message(
      "Could not delete the draft. Try again or clear this site's browser data.",
    );
  }
};
function png() {
  if (view.gesture && view.gesture.type !== "pan") return encodePNG();
  if (!blobPromise) {
    const pending = encodePNG();
    pending.catch(() => {
      if (blobPromise === pending) blobPromise = null;
    });
    blobPromise = pending;
  }
  return blobPromise;
}
function encodePNG() {
  return new Promise((resolve, reject) =>
    $("result").toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error("Could not encode PNG."))),
      "image/png",
    ),
  );
}
async function copyPNG() {
  if (!pixels || processing) return;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": png() }),
    ]);
    message("PNG copied");
  } catch {
    message("Clipboard access denied. Allow access or choose Download PNG.");
  }
}
$("copy").onclick = copyPNG;
$("download").onclick = async () => {
  try {
    const name = filename.replace(/\.[^.]*$/, "") + "-cutout.png";
    const url = URL.createObjectURL(await png()),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    message("");
  } catch (e) {
    message(e.message);
  }
};
window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || !pixels || e.altKey) return;
  if (e.code === "KeyC") {
    e.preventDefault();
    copyPNG();
  }
  if (e.code === "KeyZ" || e.code === "KeyY") {
    e.preventDefault();
    history(e.shiftKey || e.code === "KeyY");
  }
});
let resumeProcessing = false;
window.addEventListener("pagehide", () => {
  resumeProcessing = processing;
  stop();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && resumeProcessing) processPhoto();
  resumeProcessing = false;
});
if (window.history.state?.photo instanceof File) {
  const file = window.history.state.photo;
  window.history.replaceState(null, "");
  openPhoto(file);
} else
  loadDraft()
    .then((draft) => {
      if (draft.file && selection === 0) openPhoto(draft.file, draft);
    })
    .catch(() => {});
