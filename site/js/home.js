import { bindInput } from "./input.js";
import { saveFile } from "./draft.js";

bindInput(async (file) => {
  const editor = new URL("../editor/", import.meta.url);
  try {
    await saveFile(file);
  } catch {
    // Browsers can disable IndexedDB while still allowing a navigation entry
    // to carry a structured-cloned File into the editor.
    history.pushState({ photo: file }, "", editor);
    location.reload();
    return;
  }
  location.assign(editor);
});

const split = document.querySelector(".split");
split.addEventListener("input", () => {
  split.parentElement.style.setProperty("--split", split.value + "%");
});
