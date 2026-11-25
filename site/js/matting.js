// Estimate coverage from local foreground/background colours only in the model's
// transition band. Strong texture or indistinguishable colours favour the prior.
export function refineEdges(alpha, rgb, width, height) {
  const out = alpha.slice();
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  const step = Math.max(1, Math.round(Math.max(width, height) / 1100));
  const radii = [2, 5, 10, 18, 30].map((r) => r * step);
  for (let i = 0; i < alpha.length; i++) {
    const prior = alpha[i] / 255;
    if (prior < 0.006 || prior > 0.994) continue;
    const x = i % width,
      y = Math.floor(i / width);
    let br = 0,
      bg = 0,
      bb = 0,
      fr = 0,
      fg = 0,
      fb = 0,
      bw = 0,
      fw = 0,
      b2 = 0;
    for (const r of radii)
      for (const [dx, dy] of directions) {
        const xx = x + dx * r,
          yy = y + dy * r;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx,
          a = alpha[j],
          p = j * 4,
          w = 1 / r;
        const red = rgb[p],
          green = rgb[p + 1],
          blue = rgb[p + 2];
        if (a <= 3) {
          br += w * red;
          bg += w * green;
          bb += w * blue;
          bw += w;
          b2 += w * (red * red + green * green + blue * blue);
        } else if (a >= 251) {
          fr += w * red;
          fg += w * green;
          fb += w * blue;
          fw += w;
        }
      }
    if (!bw || !fw) continue;
    br /= bw;
    bg /= bw;
    bb /= bw;
    const dr = fr / fw - br,
      dg = fg / fw - bg,
      db = fb / fw - bb;
    const signal = dr * dr + dg * dg + db * db;
    const variance = Math.max(0, b2 / bw - br * br - bg * bg - bb * bb);
    if (signal < 65) continue;
    const p = i * 4,
      cr = rgb[p] - br,
      cg = rgb[p + 1] - bg,
      cb = rgb[p + 2] - bb;
    const fit = Math.max(
      0,
      Math.min(1, (cr * dr + cg * dg + cb * db) / signal),
    );
    const residual =
      (cr - fit * dr) ** 2 + (cg - fit * dg) ** 2 + (cb - fit * db) ** 2;
    const trust = signal / (signal + 6 * variance + 4 * residual + 64);
    out[i] =
      255 *
      (prior + 0.72 * trust * Math.max(-0.48, Math.min(0.48, fit - prior)));
  }
  return out;
}
