// Tests synthétiques : scène = carte déformée en perspective sur un fond.
const assert = require('assert');
const S = require('../scanner.js');

const CW = 700, CH = 400;
function makeCard() {
  const c = { width: CW, height: CH, data: new Uint8ClampedArray(CW * CH * 4) };
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const o = (y * CW + x) * 4;
    let v = [238, 232, 218];
    const bar = (x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
    if (bar(50, 60, 330, 90) || bar(50, 120, 250, 135) || bar(50, 280, 400, 295) || bar(50, 310, 360, 325)) v = [30, 30, 40];
    if (bar(520, 50, 640, 170)) v = [200, 40, 40];
    c.data.set([...v, 255], o);
  }
  return c;
}

function render(card, quad, W, H, bgFn) {
  const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  const hm = S.homography(quad, [{ x: 0, y: 0 }, { x: CW, y: 0 }, { x: CW, y: CH }, { x: 0, y: CH }]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = hm[6] * x + hm[7] * y + 1;
    const u = (hm[0] * x + hm[1] * y + hm[2]) / d, v = (hm[3] * x + hm[4] * y + hm[5]) / d;
    const o = (y * W + x) * 4;
    if (u >= 0 && u < CW - 1 && v >= 0 && v < CH - 1) {
      const s = (Math.floor(v) * CW + Math.floor(u)) * 4;
      // éclairage inégal sur la carte
      const light = 0.75 + 0.25 * (x / W);
      img.data.set([card.data[s] * light, card.data[s + 1] * light, card.data[s + 2] * light, 255], o);
    } else {
      const b = bgFn(x, y);
      img.data.set([b, b, b, 255], o);
    }
  }
  return img;
}

function cornerErr(found, expected) {
  return Math.max(...expected.map((e, i) => Math.hypot(found[i].x - e.x, found[i].y - e.y)));
}

const card = makeCard();

// Caméra réelle : f = 800 px, point principal au centre de l'image 900x700.
function project(rx, ry, rz, tx, ty, tz) {
  const pts = [[-1.75, -1], [1.75, -1], [1.75, 1], [-1.75, 1]]; // carte 3,5 x 2
  return pts.map(([x, y]) => {
    let p = [x, y, 0];
    const rot = (a, i, j) => { const c = Math.cos(a), s = Math.sin(a); const t = p[i] * c - p[j] * s; p[j] = p[i] * s + p[j] * c; p[i] = t; };
    rot(rx, 1, 2); rot(ry, 2, 0); rot(rz, 0, 1);
    const [X, Y, Z] = [p[0] + tx, p[1] + ty, p[2] + tz];
    return { x: 450 + 800 * X / Z, y: 350 + 800 * Y / Z };
  });
}

const cases = [
  { name: 'fond sombre, perspective', bg: (x, y) => 60 + 20 * Math.sin(x / 15) * Math.cos(y / 11), quad: project(0.45, -0.35, 0.1, 0.2, 0, 5.5) },
  { name: 'fond clair, légère rotation', bg: (x, y) => 120 + 8 * Math.sin(x / 9), quad: project(0.2, 0.15, -0.2, -0.3, 0.1, 5) },
  { name: 'forte rotation', bg: () => 50, quad: project(0.3, 0.2, 0.9, 0, 0, 5.5) },
];

for (const c of cases) {
  const scene = render(card, c.quad, 900, 700, c.bg);
  const det = S.detectCard(scene);
  const expected = S.orderCorners(c.quad);
  const err = cornerErr(det.corners, expected);
  console.log(`${c.name}: détecté=${det.detected} erreur max=${err.toFixed(1)}px`);
  assert(det.detected, c.name + ': non détecté');
  assert(err < 14, c.name + ': coins trop éloignés');

  const warped = S.warpCard(scene, det.corners);
  // rapport d'aspect proche de la carte (700/400 = 1.75)
  const ratio = Math.max(warped.width, warped.height) / Math.min(warped.width, warped.height);
  assert(Math.abs(ratio - 1.75) < 0.12, c.name + ': ratio ' + ratio);
  // compare au modèle (même orientation si largeur > hauteur après ordre des coins)
  const ref = S.resize(card, 1000).img;
  let diff = 0, n = 0;
  for (let y = 10; y < warped.height - 10; y += 3) for (let x = 10; x < warped.width - 10; x += 3) {
    const u = Math.floor((x / warped.width) * CW), v = Math.floor((y / warped.height) * CH);
    diff += Math.abs(warped.data[(y * warped.width + x) * 4] - card.data[(v * CW + u) * 4] * 0.875); n++;
  }
  console.log(`   redressé ${warped.width}x${warped.height}, écart moyen vs modèle=${(diff / n).toFixed(1)}`);

  const flat = S.enhance(warped, 'color');
  const lumCorner = flat.data[(20 * flat.width + 20) * 4];
  const lumRight = flat.data[(20 * flat.width + flat.width - 20) * 4];
  console.log(`   éclairage corrigé : gauche=${lumCorner.toFixed(0)} droite=${lumRight.toFixed(0)}`);
  assert(Math.abs(lumCorner - lumRight) < 25, 'éclairage non uniformisé');
  const doc = S.enhance(warped, 'document');
  assert(doc.data[(20 * doc.width + 20) * 4] > 235, 'fond du document pas blanc');
  S.enhance(warped, 'gray'); S.enhance(warped, 'original');
}

// Netteté : une image floue doit scorer nettement plus bas.
const sharp = render(card, cases[0].quad, 900, 700, cases[0].bg);
const blurred = { width: 900, height: 700, data: new Uint8ClampedArray(sharp.data) };
for (let y = 3; y < 697; y++) for (let x = 3; x < 897; x++) for (let c = 0; c < 3; c++) {
  let t = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) t += sharp.data[((y + dy) * 900 + x + dx) * 4 + c];
  blurred.data[(y * 900 + x) * 4 + c] = t / 49;
}
const sNet = S.sharpness(sharp), sFlou = S.sharpness(blurred);
console.log(`netteté nette=${sNet.toFixed(0)} floue=${sFlou.toFixed(0)}`);
assert(sFlou < sNet * 0.6, 'la mesure de netteté ne distingue pas le flou');

// Rotation 90°
const r = S.rotate90({ width: 2, height: 1, data: new Uint8ClampedArray([1, 1, 1, 255, 2, 2, 2, 255]) }, 1);
assert.strictEqual(r.width, 1); assert.strictEqual(r.height, 2); assert.strictEqual(r.data[0], 1); assert.strictEqual(r.data[4], 2);
console.log('OK');
