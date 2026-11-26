// Measure the whole subject at preview resolution, independent of its position in the frame.
export function portraitCandidate(alpha, width, height) {
  const step = Math.max(1, Math.floor(Math.max(width, height) / 160));
  const rows = [];
  let left = width,
    right = -1,
    area = 0;
  for (let y = 0; y < height; y += step) {
    let count = 0;
    for (let x = 0; x < width; x += step) {
      if (alpha[y * width + x] < 128) continue;
      count++;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
    rows.push(count);
    area += count;
  }
  if (!area) return true;
  const top = rows.findIndex((v) => v > 0),
    bottom = rows.findLastIndex((v) => v > 0);
  const body = rows.slice(top, bottom + 1);
  const widest = Math.max(...body);
  const fill = area / (body.length * (1 + (right - left) / step));
  const lower = body.slice(Math.floor(body.length * 0.65));
  const lowerWidth = lower.reduce((sum, n) => sum + n, 0) / lower.length;
  // Rectangular silhouettes and subjects supported by a thin stem favour the object model.
  return fill < 0.88 && lowerWidth > widest * 0.12;
}

export function compareMasks(a, b) {
  let first = 0,
    second = 0,
    common = 0;
  for (let i = 0; i < a.length; i += 4) {
    const x = a[i] >= 128,
      y = b[i] >= 128;
    first += x;
    second += y;
    common += x && y;
  }
  const sameSubject = first
    ? common > 0 &&
      common >= Math.min(first, second) * 0.6 &&
      common >= Math.max(first, second) * 0.32
    : second > 0;
  // One-sided disagreement is common when only the portrait model finds fine hair.
  const disputed =
    common > 0 && common < first * 0.92 && common < second * 0.92;
  return {
    sameSubject,
    disputed,
    iou: common / (first + second - common || 1),
  };
}

export function limitUnsupportedAlpha(guided, general, portrait) {
  for (let i = 0; i < guided.length; i++) {
    // Suppress new opaque patches in the backdrop while preserving shared soft edges.
    const support = Math.max(general[i], portrait[i]);
    const t = Math.max(0, Math.min(1, (support - 105) / 55));
    const limit = Math.max(
      Math.min(general[i], portrait[i]),
      255 * t * t * (3 - 2 * t),
    );
    guided[i] = Math.min(guided[i], limit);
  }
}
