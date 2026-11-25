import { $, bindInput, message } from "./input.js";
import { loadDraft, saveFile, saveMask } from "./draft.js";
import { Pixels } from "./pixels.js";
import { CanvasView } from "./canvas.js";

let pixels,
  filename,
  worker,
  selection = 0,
  request = 0,
  blobPromise,
  persist = true;
const view = new CanvasView(() => stop("Manual editing"), changed);
const status = (text) => {
  $("status").textContent = text;
};
const mb = (bytes) =>
  (bytes / 1e6).toLocaleString("en", { maximumFractionDigits: 1 });
function stop(text) {
  request++;
  worker?.terminate();
  worker = null;
  $("progress").hidden = true;
  if (text) status(text);
}
function historyButtons() {
  $("undo").disabled = !pixels?.undo.length;
  $("redo").disabled = !pixels?.redo.length;
}
function changed() {
  blobPromise = null;
  historyButtons();
  if (persist)
    saveMask(pixels.alpha.slice()).catch(() =>
      message("Draft could not be saved. Download your PNG before closing."),
    );
}
function history(forward) {
  if (!pixels) return;
  view.cancel();
  stop();
  if (pixels.history(forward)) {
    changed();
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
    const failure = (detail) => {
      if (ticket !== request) return;
      stop();
      status(
        "Processing failed. " +
          detail +
          " Edit manually or choose Apply to retry.",
      );
    };
    worker.onerror = (e) =>
      failure(e.message || "The processing worker could not load.");
    worker.onmessage = ({ data }) => {
      if (ticket !== request) return;
      const bar = $("progress");
      if (data.stage === "download") {
        bar.hidden = false;
        bar.max = data.total;
        bar.value = data.loaded;
        status(
          "Downloading " +
            data.asset +
            " · " +
            mb(data.loaded) +
            " of " +
            mb(data.total) +
            " MB",
        );
      } else if (data.stage === "process") {
        bar.hidden = false;
        bar.removeAttribute("value");
        status(
          "Processing on CPU · " +
            (data.kind === "product" ? "object" : "portrait & hair"),
        );
      } else if (data.stage === "done") {
        stop();
        if (pixels.automatic(data.alpha)) changed();
        status(
          "Done · " +
            (data.method === "product" ? "object" : "portrait & hair"),
        );
      } else if (data.stage === "error") failure(data.message);
    };
    worker.postMessage({ image: bitmap, kind }, [bitmap]);
  } catch (e) {
    bitmap?.close();
    if (ticket === request) {
      stop();
      status(
        "Model failed to start. " + e.message + " You can still edit manually.",
      );
    }
  }
}
$("run").onclick = processPhoto;
async function openPhoto(file, saved, restoring = false) {
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
  if (!restoring) {
    saveFile(file).catch(() => {
      if (generation === selection) {
        persist = false;
        message(
          "Draft storage is unavailable. Download your PNG before closing.",
        );
      }
    });
  }
  if (saved?.length === pixels.alpha.length) status("Draft restored");
  else await processPhoto();
}
bindInput((file) => openPhoto(file));
function png() {
  if (view.gesture && view.gesture.type !== "pan") return encodePNG();
  if (!blobPromise) blobPromise = encodePNG();
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
  if (!pixels) return;
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
  resumeProcessing = Boolean(worker);
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
    .then(({ file, mask }) => {
      if (file && selection === 0) openPhoto(file, mask, true);
    })
    .catch(() => {});
