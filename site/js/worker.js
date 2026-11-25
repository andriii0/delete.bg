import { infer } from "./inference.js";

self.onmessage = async ({ data: { image, kind } }) => {
  const report = (progress) => postMessage(progress);
  try {
    let method = kind === "auto" ? "detail" : kind;
    let result = await infer(image, method, report);
    if (kind === "auto") {
      // Most cropped bust portraits occupy a broad part of the bottom row.
      // An isolated item with a narrow stem should use general segmentation.
      const bottom = result.alpha.subarray(result.alpha.length - image.width);
      let occupied = 0;
      for (const value of bottom) if (value > 220) occupied++;
      if (occupied < image.width * 0.12) {
        method = "product";
        result = await infer(image, method, report);
      }
    }
    postMessage({ stage: "done", method, ...result }, [result.alpha.buffer]);
  } catch (error) {
    postMessage({
      stage: "error",
      message: (error.message || String(error)).replace(
        /\{(\w+)\}/g,
        (match, key) => error.values?.[key] ?? match,
      ),
      template: error.values ? error.message : undefined,
      values: error.values,
    });
  } finally {
    image.close();
  }
};
