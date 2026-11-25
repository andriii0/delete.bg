// Keep the original database name so existing drafts survive an app update.
const scope = new URL("../", import.meta.url).pathname;
const tabKey = "contour.tab." + scope;
const lifetime = 7 * 86400000;
const tileSize = 256;
let connection, owner;

function database() {
  return (connection ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("contour." + scope, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("files");
      req.result.createObjectStore("masks");
    };
    req.onerror = () => {
      connection = null;
      reject(req.error);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      db.onclose = () => {
        connection = null;
      };
      resolve(db);
    };
  }));
}

async function transaction(mode, operate) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["files", "masks"], mode);
    const result = operate(tx.objectStore("files"), tx.objectStore("masks"));
    tx.oncomplete = () => resolve(result?.());
    tx.onerror = tx.onabort = () =>
      reject(tx.error || Error("Local storage is unavailable."));
  });
}

const parts = (id) => IDBKeyRange.bound([id], [id, []]);
function remove(files, masks, id) {
  files.delete(id);
  masks.delete(id);
  masks.delete(parts(id));
}

export async function pruneDrafts() {
  const cutoff = Date.now() - lifetime;
  const expired = await transaction("readonly", (files) => {
    const ids = [];
    const cursor = files.openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return;
      if (row.value.date < cutoff) ids.push(row.key);
      row.continue();
    };
    return () => ids;
  });
  for (const id of expired) {
    const prune = () =>
      transaction("readwrite", (files, masks) => {
        const req = files.get(id);
        req.onsuccess = () => {
          if (req.result?.date < cutoff) remove(files, masks, id);
        };
      });
    if (navigator.locks)
      await navigator.locks.request(
        tabKey + id,
        { ifAvailable: true },
        (lock) => lock && prune(),
      );
    else await prune();
  }
}

function fork(from, to) {
  return transaction("readwrite", (files, masks) => {
    const file = files.get(from);
    file.onsuccess = () => {
      if (file.result) files.put(file.result, to);
    };
    const base = masks.get(from);
    base.onsuccess = () => {
      if (base.result) masks.put(base.result, to);
    };
    const cursor = masks.openCursor(parts(from));
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return;
      masks.put(row.value, [to, row.key[1]]);
      row.continue();
    };
  });
}

function claim(id) {
  return new Promise((resolve, reject) => {
    navigator.locks
      .request(tabKey + id, { ifAvailable: true }, (lock) => {
        resolve(Boolean(lock));
        if (!lock) return;
        // The browser also releases this lock when the document is destroyed.
        return new Promise((release) => {
          window.addEventListener("pagehide", (e) => {
            if (!e.persisted) release();
          });
        });
      })
      .catch(reject);
  });
}

async function acquire() {
  await pruneDrafts();
  const previous = sessionStorage.getItem(tabKey);
  let id = previous || crypto.randomUUID();
  if (!navigator.locks) throw Error("Local storage is unavailable.");
  if (!(await claim(id))) {
    id = crypto.randomUUID();
    await claim(id);
    if (previous) await fork(previous, id);
  }
  sessionStorage.setItem(tabKey, id);
  return id;
}

function tab() {
  return (owner ??= acquire().catch((error) => {
    owner = null;
    throw error;
  }));
}

export async function saveFile(file, token) {
  const id = await tab();
  await transaction("readwrite", (files, masks) => {
    remove(files, masks, id);
    files.put({ file, token, date: Date.now() }, id);
  });
}

export async function deleteDraft() {
  const id = await tab();
  await transaction("readwrite", (files, masks) => remove(files, masks, id));
}

// Snapshot only tiles touched by this edit before yielding to IndexedDB.
export async function saveEdit(token, pixels, box, colorsChanged) {
  const { width, height, alpha, colors } = pixels;
  const tiles = [];
  for (
    let y = Math.floor(box.y / tileSize) * tileSize;
    y < box.y + box.h;
    y += tileSize
  ) {
    for (
      let x = Math.floor(box.x / tileSize) * tileSize;
      x < box.x + box.w;
      x += tileSize
    ) {
      const w = Math.min(tileSize, width - x),
        h = Math.min(tileSize, height - y);
      const data = new Uint8ClampedArray(w * h);
      for (let row = 0; row < h; row++) {
        const start = (y + row) * width + x;
        data.set(alpha.subarray(start, start + w), row * w);
      }
      tiles.push({ x, y, w, data });
    }
  }
  const id = await tab();
  await transaction("readwrite", (files, masks) => {
    const req = files.get(id);
    req.onsuccess = () => {
      const entry = req.result;
      if (!entry || entry.token !== token) return;
      files.put({ ...entry, date: Date.now() }, id);
      for (const tile of tiles) masks.put(tile, [id, tile.y * width + tile.x]);
      if (colorsChanged) masks.put(colors, [id, "colors"]);
    };
  });
}

export async function loadDraft() {
  const id = await tab();
  return transaction("readwrite", (files, masks) => {
    const req = files.get(id),
      base = masks.get(id);
    const tiles = [];
    let colors;
    const cursor = masks.openCursor(parts(id));
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return;
      if (row.key[1] === "colors") colors = row.value;
      else tiles.push(row.value);
      row.continue();
    };
    req.onsuccess = () => {
      if (req.result && !req.result.token) {
        req.result.token = crypto.randomUUID();
        files.put(req.result, id);
      }
    };
    return () => ({ ...req.result, mask: base.result, colors, tiles });
  });
}
