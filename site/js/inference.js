import { refineEdges } from "./matting.js";
import * as ort from "../vendor/ort.wasm.min.mjs";

const vendor = new URL("../vendor/", import.meta.url);
ort.env.wasm.wasmPaths = vendor.href;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
const models = {
  portrait: {
    file: "modnet.onnx",
    bytes: 25888640,
    hash: "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9",
  },
  object: {
    file: "u2netp.onnx",
    bytes: 4574861,
    hash: "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8",
  },
};

let runtimeReady = false;
async function assetBytes(model, report) {
  const url = new URL(model.file, vendor).href;
  const key = url + "?sha256=" + model.hash;
  const valid = async (data) => {
    if (data.byteLength !== model.bytes) return false;
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    return (
      Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("") ===
      model.hash
    );
  };
  let cache;
  try {
    cache = await caches.open("contour-assets-ort1.22-v1");
  } catch {}
  try {
    const hit = (await cache?.match(key)) ?? (await cache?.match(url));
    if (hit) {
      const cached = await hit.arrayBuffer();
      if (await valid(cached)) return cached;
      await cache.delete(key);
      await cache.delete(url);
    }
  } catch {}
  report({
    stage: "download",
    asset: model.label,
    loaded: 0,
    total: model.bytes,
  });
  let response;
  try {
    response = await fetch(key, { cache: "reload" });
  } catch {
    throw Object.assign(
      Error("Could not download {asset}. Check your connection."),
      { values: { asset: model.label } },
    );
  }
  if (!response.ok)
    throw Object.assign(Error("Could not download {asset} (HTTP {code})."), {
      values: { asset: model.label, code: String(response.status) },
    });
  const reader = response.body.getReader();
  const data = new Uint8Array(model.bytes);
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > data.length)
      throw Error("Asset integrity check failed.");
    data.set(value, loaded);
    loaded += value.length;
    report({
      stage: "download",
      asset: model.label,
      loaded,
      total: model.bytes,
    });
  }
  if (loaded !== data.length) throw Error("Model download was incomplete.");
  if (!(await valid(data))) throw Error("Asset integrity check failed.");
  try {
    await cache?.put(key, new Response(data));
  } catch {}
  return data.buffer;
}

function context(width, height) {
  const ctx = new OffscreenCanvas(width, height).getContext("2d", {
    willReadFrequently: true,
  });
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

export async function infer(image, kind, report = () => {}, guide) {
  const portrait = kind !== "object" && kind !== "product";
  const model = models[portrait ? "portrait" : "object"];
  const bytes = await assetBytes(
    { ...model, label: portrait ? "MODNet" : "U²-Netp" },
    report,
  );
  if (!runtimeReady) {
    ort.env.wasm.wasmBinary = await assetBytes(
      {
        file: "ort-wasm-simd-threaded.wasm",
        bytes: 11210254,
        hash: "71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4",
        label: "WebAssembly",
      },
      report,
    );
    runtimeReady = true;
  }
  report({ stage: "process", kind });
  const started = performance.now();
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ["wasm"],
  });
  try {
    const scale =
      (kind === "detail" ? 1024 : 672) / Math.max(image.width, image.height);
    const dimension = (length) =>
      Math.max(32, Math.round((length * scale) / 32) * 32);
    const width = portrait ? dimension(image.width) : 320;
    const height = portrait ? dimension(image.height) : 320;
    const small = context(width, height);
    small.drawImage(image, 0, 0, width, height);
    const frame = small.getImageData(0, 0, width, height);
    if (guide) {
      // Suppress likely background in the network input only. Upsampling and
      // foreground colour recovery below still use the untouched source.
      for (let y = 0; y < height; y++) {
        const row =
          Math.floor(((y + 0.5) * image.height) / height) * image.width;
        for (let x = 0; x < width; x++) {
          const hint =
            guide[row + Math.floor(((x + 0.5) * image.width) / width)];
          const keep = Math.min(1, hint / 64);
          const i = (y * width + x) * 4;
          for (let c = 0; c < 3; c++)
            frame.data[i + c] = keep * frame.data[i + c] + (1 - keep) * 170;
        }
      }
    }
    const area = width * height;
    const rgb = new Float32Array(area * 3);
    let peak = 1;
    if (!portrait)
      for (let i = 0; i < frame.data.length; i += 4)
        peak = Math.max(
          peak,
          frame.data[i],
          frame.data[i + 1],
          frame.data[i + 2],
        );
    const mean = portrait ? [0.5, 0.5, 0.5] : [0.485, 0.456, 0.406];
    const std = portrait ? [0.5, 0.5, 0.5] : [0.229, 0.224, 0.225];
    for (let c = 0; c < 3; c++)
      for (let i = 0; i < area; i++)
        rgb[c * area + i] =
          (frame.data[4 * i + c] / (portrait ? 255 : peak) - mean[c]) / std[c];
    const input = new ort.Tensor("float32", rgb, [1, 3, height, width]);
    const outputs = await session.run({ [session.inputNames[0]]: input }, [
      session.outputNames[0],
    ]);
    const matte = outputs[session.outputNames[0]].data;
    let lo = 0,
      hi = 1;
    if (!portrait) {
      lo = Infinity;
      hi = -Infinity;
      for (const v of matte) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    for (let i = 0; i < area; i++) {
      const value = (255 * (matte[i] - lo)) / (hi - lo || 1);
      frame.data.fill(value, 4 * i, 4 * i + 3);
      frame.data[4 * i + 3] = 255;
    }
    small.putImageData(frame, 0, 0);
    const full = context(image.width, image.height);
    full.drawImage(small.canvas, 0, 0, image.width, image.height);
    const pixels = full.getImageData(0, 0, image.width, image.height).data;
    const alpha = new Uint8ClampedArray(image.width * image.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[4 * i];
    let result = { alpha };
    if (kind === "detail" || kind === "product") {
      full.clearRect(0, 0, image.width, image.height);
      full.drawImage(image, 0, 0);
      result = refineEdges(
        alpha,
        full.getImageData(0, 0, image.width, image.height).data,
        image.width,
        image.height,
      );
    }
    return { ...result, ms: Math.round(performance.now() - started) };
  } finally {
    await session.release();
  }
}
