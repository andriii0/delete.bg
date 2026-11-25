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

export function sameSubject(a, b) {
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
  if (!first) return second > 0;
  return (
    common >= Math.min(first, second) * 0.6 &&
    common >= Math.max(first, second) * 0.32
  );
}
