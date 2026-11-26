import { infer } from "./inference.js";
import {
  portraitCandidate,
  compareMasks,
  limitUnsupportedAlpha,
} from "./selection.js";

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
        const general = result.alpha;
        const match = compareMasks(general, portrait.alpha);
        if (match.sameSubject) {
          result = portrait;
          method = "detail";
          if (match.disputed) {
            const guided = await infer(image, method, report, general);
            limitUnsupportedAlpha(guided.alpha, general, portrait.alpha);
            if (
              compareMasks(general, guided.alpha).iou > match.iou &&
              compareMasks(portrait.alpha, guided.alpha).sameSubject
            ) {
              result = guided;
            }
          }
        }
      } catch {
        // Keep the last successful mask if an optional pass fails.
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
