// Banc d'essai de précision : scènes réalistes (coins arrondis, ombre, bruit, flou, faible contraste).
// Usage : node test/bench.js        (affiche l'erreur max des coins en pixels de l'image 2000x1500)
const S = require('../scanner.js');
const W = 2000, H = 1500, CW = 700, CH = 400, R = 28;

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }

function project(rx, ry, rz, tx, ty, tz) {
  const pts = [[-1.75, -1], [1.75, -1], [1.75, 1], [-1.75, 1]];
  return pts.map(([x, y]) => {
    const p = [x, y, 0];
    const rot = (a, i, j) => { const c = Math.cos(a), s = Math.sin(a); const t = p[i] * c - p[j] * s; p[j] = p[i] * s + p[j] * c; p[i] = t; };
    rot(rx, 1, 2); rot(ry, 2, 0); rot(rz, 0, 1);
    const [X, Y, Z] = [p[0] + tx, p[1] + ty, p[2] + tz];
    return { x: W / 2 + 1600 * X / Z, y: H / 2 + 1600 * Y / Z };
  });
}

function cardColor(u, v, base) {
  const bar = (x0, y0, x1, y1) => u >= x0 && u < x1 && v >= y0 && v < y1;
  if (bar(50, 60, 330, 90) || bar(50, 120, 250, 135) || bar(50, 280, 400, 295) || bar(50, 310, 360, 325)) return [30, 30, 40];
  if (bar(520, 50, 640, 170)) return [200, 40, 40];
  return base;
}

// distance (en px carte) à l'extérieur d'un rectangle arrondi
function outsideDist(u, v) {
  const dx = Math.max(Math.abs(u - CW / 2) - (CW / 2 - R), 0), dy = Math.max(Math.abs(v - CH / 2) - (CH / 2 - R), 0);
  return Math.hypot(dx, dy) - R;
}

function scene({ quad, bg, card, shadow = 0.4, noise = 3, texture = 6, seed = 1, bgGrad = 0, cardGrad = 0 }) {
  const hm = S.homography(quad, [{ x: 0, y: 0 }, { x: CW, y: 0 }, { x: CW, y: CH }, { x: 0, y: CH }]);
  const r = rng(seed);
  const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = hm[6] * x + hm[7] * y + 1;
    const u = (hm[0] * x + hm[1] * y + hm[2]) / d, v = (hm[3] * x + hm[4] * y + hm[5]) / d;
    const od = outsideDist(u, v);
    const tex = texture * Math.sin(x / 37) * Math.cos(y / 53);
    // éclairage inégal : fond plus clair en haut (bgGrad), carte plus sombre à gauche (cardGrad)
    let c = bg.map((b) => (b + tex) * (1 + bgGrad * (0.5 - y / H)));
    if (od <= 0) c = cardColor(u, v, card).map((b) => b * (1 - cardGrad * (1 - u / CW)));
    else if (shadow) { const k = 1 - shadow * Math.exp(-Math.pow((od - 6) / 18, 2)); c = c.map((b) => b * k); }
    const o = (y * W + x) * 4;
    const n = gauss(r) * noise;
    img.data[o] = c[0] + n; img.data[o + 1] = c[1] + n; img.data[o + 2] = c[2] + n; img.data[o + 3] = 255;
  }
  return blur(img);
}
function blur(img) { // flou léger 3x3 (objectif imparfait)
  const out = { ...img, data: new Uint8ClampedArray(img.data) };
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) for (let c = 0; c < 3; c++) {
    let t = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t += img.data[((y + dy) * W + x + dx) * 4 + c] * (dx === 0 && dy === 0 ? 4 : 1);
    out.data[(y * W + x) * 4 + c] = t / 12;
  }
  return out;
}

const cases = [
  { name: 'A fond sombre', quad: project(0.35, -0.3, 0.12, 0.2, 0, 5.2), bg: [60, 60, 60], card: [238, 232, 218] },
  { name: 'B faible contraste + ombre', quad: project(0.25, 0.2, -0.15, -0.2, 0.1, 5), bg: [190, 188, 182], card: [222, 218, 205], shadow: 0.35 },
  { name: 'C même luminance, teinte différente', quad: project(-0.3, 0.25, 0.3, 0, 0.1, 5.4), bg: [130, 250, 250], card: [225, 220, 205], shadow: 0.15 },
  { name: 'D carte blanche sur fond clair', quad: project(0.2, -0.25, 0.05, 0.1, -0.1, 5), bg: [228, 226, 220], card: [250, 249, 245], shadow: 0.45 },
  { name: 'F carte blanche, fond teal éclairé en dégradé', quad: project(0.12, -0.1, 0.02, 0, 0.25, 5.2), bg: [105, 150, 140], card: [240, 238, 236], bgGrad: 0.9, cardGrad: 0.35, shadow: 0.3, texture: 10, noise: 6 },
  { name: 'E fond texturé bruité', quad: project(0.4, 0.1, -0.25, 0, 0, 5.6), bg: [110, 100, 85], card: [235, 235, 228], texture: 22, noise: 8 },
];

if (require.main === module) {
  let worst = 0;
  const t0 = Date.now();
  for (const c of cases) {
    const img = scene(c);
    const det = S.detectCard(img);
    const exp = S.orderCorners(c.quad);
    const errs = exp.map((e, i) => Math.hypot(det.corners[i].x - e.x, det.corners[i].y - e.y));
    const max = Math.max(...errs);
    worst = Math.max(worst, max);
    console.log(`${c.name.padEnd(38)} détecté=${det.detected ? 'oui' : 'NON'}  erreur max=${max.toFixed(1)}px  (${errs.map((e) => e.toFixed(1)).join(' / ')})`);
  }
  console.log(`pire cas: ${worst.toFixed(1)}px — ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (worst > 6) { console.error('ÉCHEC : erreur de coin > 6 px'); process.exit(1); }
}
module.exports = { cases, scene };
