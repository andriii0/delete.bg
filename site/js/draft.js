// A tab owns a single draft. Separate stores allow alpha updates without rewriting the photo.
const scope = new URL("../", import.meta.url).pathname;
const key = "contour.tab." + scope;
let connection;
function tabKey() {
  if (!sessionStorage.getItem(key))
    sessionStorage.setItem(key, crypto.randomUUID());
  return sessionStorage.getItem(key);
}
function database() {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const req = indexedDB.open("contour." + scope, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("files");
        req.result.createObjectStore("masks");
      };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  return connection;
}
async function transaction(mode, operate) {
  const db = await database();
  const id = tabKey();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["files", "masks"], mode);
    const result = operate(
      tx.objectStore("files"),
      tx.objectStore("masks"),
      id,
    );
    tx.oncomplete = () => resolve(result?.());
    tx.onerror = tx.onabort = () =>
      reject(tx.error || Error("Local storage is unavailable."));
  });
}
export function saveFile(file) {
  return transaction("readwrite", (files, masks, id) => {
    files.put({ file, date: Date.now() }, id);
    masks.delete(id);
    const cursor = files.openCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (!entry) return;
      if (entry.value.date < Date.now() - 7 * 86400000) {
        entry.delete();
        masks.delete(entry.key);
      }
      entry.continue();
    };
  });
}
export function saveMask(alpha) {
  return transaction("readwrite", (_files, masks, id) => {
    masks.put(alpha, id);
  });
}
export function loadDraft() {
  return transaction("readonly", (files, masks, id) => {
    const file = files.get(id),
      mask = masks.get(id);
    return () => ({ file: file.result?.file, mask: mask.result });
  });
}
