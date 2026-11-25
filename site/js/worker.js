import { infer } from "./inference.js";
import { portraitCandidate, sameSubject } from "./selection.js";

self.onmessage = async ({ data: { image, kind } }) => {
  const report = (progress) => postMessage(progress);
  try {
    let method = kind === "auto" ? "product" : kind;
    let result = await infer(image, method, report);
    if (
      kind === "auto" &&
      portraitCandidate(result.alpha, image.width, image.height)
    ) {
      try {
        const portrait = await infer(image, "detail", report);
        if (sameSubject(result.alpha, portrait.alpha)) {
          result = portrait;
          method = "detail";
        }
      } catch {
        // The general mask remains usable when the optional portrait pass fails.
      }
    }
    const buffers = [result.alpha.buffer];
    if (result.colors) buffers.push(result.colors.buffer);
    postMessage({ stage: "done", method, ...result }, buffers);
  } catch (error) {
    const known = [
      "Model download was incomplete.",
      "Asset integrity check failed.",
    ];
    const template =
      error.values || known.includes(error.message)
        ? error.message
        : "The inference engine could not process this image.";
    postMessage({
      stage: "error",
      template,
      values: error.values,
      message: error.message,
    });
  } finally {
    image.close();
  }
};
