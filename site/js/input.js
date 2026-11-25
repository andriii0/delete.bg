import { showText } from "./language.js";

export const $ = (id) => document.getElementById(id);
export function message(text) {
  showText($("message"), text);
}

export function bindInput(open) {
  let dragDepth = 0;
  const zone = $("zone");
  const input = $("file");
  const receive = (file) => {
    if (!file) return message("No image found. Choose a photo.");
    if (file.type && !file.type.startsWith("image/"))
      return message("Choose an image file, such as JPG, PNG or WebP.");
    message("");
    Promise.resolve(open(file)).catch((e) => message(e.message));
  };
  zone.onclick = () => input.click();
  if ($("open")) $("open").onclick = () => input.click();
  input.onchange = () => {
    const file = input.files[0];
    input.value = "";
    if (file) receive(file);
  };
  const target = () =>
    $("studio") && !$("studio").hidden ? $("viewport") : zone;
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    target().classList.remove("drag");
    if (target().contains(e.target)) receive(e.dataTransfer.files[0]);
  });
  for (const el of [zone, $("viewport")].filter(Boolean)) {
    el.ondragenter = (e) => {
      e.preventDefault();
      dragDepth++;
      el.classList.add("drag");
    };
    el.ondragleave = () => {
      if (--dragDepth <= 0) {
        dragDepth = 0;
        el.classList.remove("drag");
      }
    };
  }
  window.addEventListener("paste", (e) => {
    const image = [...e.clipboardData.items].find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    e.preventDefault();
    receive(image?.getAsFile());
  });
  async function readClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((type) => type.startsWith("image/"));
        if (type) {
          receive(
            new File(
              [await item.getType(type)],
              "clipboard." + type.split("/")[1],
              { type },
            ),
          );
          return;
        }
      }
      message("No image in the clipboard. Copy a photo and press Ctrl+V.");
    } catch {
      message("Clipboard access denied. Press Ctrl+V or choose a photo.");
    }
  }
  for (const el of [$("paste"), $("empty-paste")].filter(Boolean))
    el.onclick = readClipboard;
}
