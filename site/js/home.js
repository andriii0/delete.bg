import { bindInput } from "./input.js";
import { pruneDrafts } from "./draft.js";

pruneDrafts().catch(() => {});
bindInput((file) => {
  const editor = new URL("../editor/", import.meta.url);
  history.pushState({ photo: file }, "", editor);
  location.reload();
});

const split = document.querySelector(".split");
split.addEventListener("input", () => {
  split.parentElement.style.setProperty("--split", split.value + "%");
});
