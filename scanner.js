/*
 * scanner.js — traitement d'image d'une carte de visite, sans dépendance.
 *
 *   detectCard   : repère les 4 coins de la carte dans une photo
 *   warpCard     : redresse la perspective (homographie) vers un rectangle
 *   enhance      : égalise l'éclairage, contraste, netteté (plusieurs modes)
 *   sharpness    : mesure de netteté pour avertir si la photo est floue
 *
 * Les images sont des objets { data: Uint8ClampedArray (RGBA), width, height },
 * compatibles avec ImageData, donc utilisables dans le navigateur et dans Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scanner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /* ---------- primitives image ---------- */

  function newImage(w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  function toGray(img) {
    const { data, width: w, height: h } = img;
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      g[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    }
    return g;
  }

  // Réduction par moyenne de blocs (qualité suffisante pour la détection).
  function resize(img, maxDim) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (scale === 1) return { img, scale: 1 };
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const out = newImage(w, h);
    const sx = img.width / w, sy = img.height / h;
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        let r = 0, g = 0, b = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const j = (yy * img.width + xx) * 4;
            r += img.data[j]; g += img.data[j + 1]; b += img.data[j + 2]; n++;
          }
        }
        const o = (y * w + x) * 4;
        out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n; out.data[o + 3] = 255;
      }
    }
    return { img: out, scale };
  }

  function boxBlur(src, w, h, r) {
    if (r < 1) return Float32Array.from(src);
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const d = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[row + clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / d;
        sum += src[row + clamp(x + r + 1, 0, w - 1)] - src[row + clamp(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / d;
        sum += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
      }
    }
    return out;
  }

  function maxFilter(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = -Infinity;
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k]);
        tmp[y * w + x] = m;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = -Infinity;
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]);
        out[y * w + x] = m;
      }
    }
    return out;
  }

  function percentileOf(values, p) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < values.length; i++) hist[clamp(Math.round(values[i]), 0, 255)]++;
    const target = values.length * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  }

  /* ---------- détection des bords du document ---------- */

  function sobelMagnitude(g, w, h) {
    const mag = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1]) / 4;
        const gy = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1]) / 4;
        mag[i] = Math.hypot(gx, gy);
      }
    }
    return mag;
  }

  function dilate(mask, w, h) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let dy = -1; dy <= 1 && !v; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < w && mask[yy * w + xx]) { v = 1; break; }
          }
        }
        out[y * w + x] = v;
      }
    }
    return out;
  }

  function erode(mask, w, h) {
    const inv = mask.map((v) => 1 - v);
    // bord de l'image traité comme « plein » pour ne pas ronger la forme collée au bord
    const d = dilate(inv, w, h);
    return d.map((v) => 1 - v);
  }

  // Pixels de fond : remplissage depuis les bords à travers les pixels non-masque.
  function fillHoles(mask, w, h) {
    const outside = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => {
      const i = y * w + x;
      if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i / w) | 0;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    return outside.map((v) => 1 - v);
  }

  function largestComponent(mask, w, h) {
    const label = new Int32Array(w * h);
    let best = 0, bestSize = 0, id = 0;
    const stack = [];
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || label[s]) continue;
      id++;
      let size = 0;
      label[s] = id;
      stack.push(s);
      while (stack.length) {
        const i = stack.pop();
        size++;
        const x = i % w, y = (i / w) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (mask[j] && !label[j]) { label[j] = id; stack.push(j); }
          }
        }
      }
      if (size > bestSize) { bestSize = size; best = id; }
    }
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = label[i] === best ? 1 : 0;
    return { mask: out, size: bestSize };
  }

  function convexHull(points) {
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  function polyArea(p) {
    let a = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      a += p[i].x * q.y - q.x * p[i].y;
    }
    return Math.abs(a) / 2;
  }

  // Réduit le polygone en retirant le sommet qui change le moins l'aire (Visvalingam).
  function simplifyPolygon(poly, maxPts) {
    const p = poly.slice();
    const tri = (a, b, c) => Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    while (p.length > maxPts) {
      let bi = 0, bv = Infinity;
      for (let i = 0; i < p.length; i++) {
        const v = tri(p[(i + p.length - 1) % p.length], p[i], p[(i + 1) % p.length]);
        if (v < bv) { bv = v; bi = i; }
      }
      p.splice(bi, 1);
    }
    return p;
  }

  // Quadrilatère d'aire maximale parmi les sommets de l'enveloppe convexe.
  function bestQuad(hull) {
    const p = simplifyPolygon(hull, 12);
    if (p.length < 4) return null;
    let best = null, bestA = -1;
    const n = p.length;
    for (let a = 0; a < n - 3; a++)
      for (let b = a + 1; b < n - 2; b++)
        for (let c = b + 1; c < n - 1; c++)
          for (let d = c + 1; d < n; d++) {
            const q = [p[a], p[b], p[c], p[d]];
            const area = polyArea(q);
            if (area > bestA) { bestA = area; best = q; }
          }
    return best;
  }

  // Ordre : haut-gauche, haut-droit, bas-droit, bas-gauche.
  function orderCorners(pts) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const sorted = pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    let start = 0, min = Infinity;
    sorted.forEach((p, i) => { if (p.x + p.y < min) { min = p.x + p.y; start = i; } });
    return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]);
  }

  function boundaryPoints(mask, w, h) {
    const pts = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
            !mask[y * w + x - 1] || !mask[y * w + x + 1] || !mask[(y - 1) * w + x] || !mask[(y + 1) * w + x]) {
          pts.push({ x, y });
        }
      }
    }
    return pts;
  }

  // Transforme un masque candidat en { corners, score }.
  function candidateFromMask(mask, w, h) {
    const { mask: comp, size } = largestComponent(mask, w, h);
    if (size < w * h * 0.06) return null;
    const hull = convexHull(boundaryPoints(comp, w, h));
    const quad = bestQuad(hull);
    if (!quad) return null;
    const quadArea = polyArea(quad);
    const frac = quadArea / (w * h);
    if (frac < 0.06 || frac > 0.985) return null;
    const solidity = Math.min(1, size / quadArea); // 1 = la forme remplit bien son quadrilatère
    // plus la carte est grande dans l'image, mieux c'est, mais surtout il faut qu'elle soit « carrée »
    const score = solidity * (0.6 + 0.4 * Math.min(1, frac / 0.4));
    return { corners: orderCorners(quad), score, solidity };
  }

  // Stratégie 1 : contours (Sobel) fermés puis remplis.
  function maskFromEdges(g, w, h) {
    const blurred = boxBlur(boxBlur(g, w, h, 1), w, h, 1);
    const mag = sobelMagnitude(blurred, w, h);
    const p99 = percentileOf(mag.map((v) => Math.min(255, v * 2)), 0.99) / 2;
    const thr = Math.max(5, 0.15 * p99);
    let edges = new Uint8Array(w * h);
    for (let i = 0; i < edges.length; i++) edges[i] = mag[i] > thr ? 1 : 0;
    edges = dilate(dilate(edges, w, h), w, h);
    const filled = fillHoles(edges, w, h);
    return erode(erode(filled, w, h), w, h);
  }

  // Stratégie 2 : seuil d'Otsu, la carte étant l'inverse du fond (pris sur le pourtour).
  function maskFromThreshold(g, w, h) {
    const b = boxBlur(g, w, h, 2);
    const hist = new Float64Array(256);
    for (let i = 0; i < b.length; i++) hist[clamp(Math.round(b[i]), 0, 255)]++;
    let total = b.length, sumAll = 0;
    for (let v = 0; v < 256; v++) sumAll += v * hist[v];
    let wB = 0, sumB = 0, bestVar = -1, thr = 128;
    for (let v = 0; v < 256; v++) {
      wB += hist[v];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += v * hist[v];
      const mB = sumB / wB, mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > bestVar) { bestVar = between; thr = v; }
    }
    let ring = 0, n = 0;
    const margin = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (x < margin || y < margin || x >= w - margin || y >= h - margin) { ring += b[y * w + x]; n++; }
    const bgIsDark = ring / n <= thr;
    let mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = (b[i] > thr) === bgIsDark ? 1 : 0;
    // ouverture (retire le bruit) puis remplissage des trous (texte)
    mask = dilate(dilate(erode(erode(mask, w, h), w, h), w, h), w, h);
    return fillHoles(mask, w, h);
  }

  /**
   * Détecte les 4 coins de la carte.
   * @returns {{corners: {x,y}[], detected: boolean}} coins TL,TR,BR,BL en pixels de `img`.
   */
  function detectCard(img) {
    const { img: small, scale } = resize(img, 480);
    const w = small.width, h = small.height;
    const g = toGray(small);
    const candidates = [candidateFromMask(maskFromEdges(g, w, h), w, h), candidateFromMask(maskFromThreshold(g, w, h), w, h)]
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best && best.solidity > 0.8) {
      return { detected: true, corners: best.corners.map((p) => ({ x: p.x / scale, y: p.y / scale })) };
    }
    const mx = img.width * 0.1, my = img.height * 0.1;
    return {
      detected: false,
      corners: [
        { x: mx, y: my }, { x: img.width - mx, y: my },
        { x: img.width - mx, y: img.height - my }, { x: mx, y: img.height - my },
      ],
    };
  }

  /* ---------- redressement de perspective ---------- */

  // Résout H (3x3) tel que H · dst[i] = src[i].
  function homography(dst, src) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = dst[i], { x: u, y: v } = src[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const n = 8;
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      for (let r = c + 1; r < n; r++) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < n; k++) s -= A[r][k] * h[k];
      h[r] = s / A[r][r];
    }
    return h; // h[8] = 1
  }

  // Formats courants (largeur/hauteur) sur lesquels « accrocher » le résultat.
  const CARD_RATIOS = [85 / 55, 3.5 / 2, 90 / 50, 85 / 54];

  // Rapport largeur/hauteur réel de la carte à partir de sa vue en perspective
  // (Zhang & He, « Whiteboard scanning », 2007) ; le point principal est le centre de l'image.
  function estimateAspect(corners, width, height) {
    const [tl, tr, br, bl] = corners;
    const u0 = width / 2, v0 = height / 2;
    const m1 = [tl.x - u0, tl.y - v0, 1], m2 = [tr.x - u0, tr.y - v0, 1];
    const m3 = [bl.x - u0, bl.y - v0, 1], m4 = [br.x - u0, br.y - v0, 1];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const den2 = dot(cross(m2, m4), m3), den3 = dot(cross(m3, m4), m2);
    if (Math.abs(den2) < 1e-9 || Math.abs(den3) < 1e-9) return null;
    const k2 = dot(cross(m1, m4), m3) / den2, k3 = dot(cross(m1, m4), m2) / den3;
    const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
    const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
    const nz = n2[2] * n3[2];
    if (Math.abs(nz) < 1e-9) return null; // quasi-parallélogramme : pas de perspective mesurable
    const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / nz;
    if (!(f2 > 0)) return null;
    const f = Math.sqrt(f2);
    const len2 = (n) => ((n[0]) / f) ** 2 + ((n[1]) / f) ** 2 + n[2] ** 2;
    const r = Math.sqrt(len2(n2) / len2(n3));
    return r > 0.3 && r < 3.3 ? r : null;
  }

  function warpCard(img, corners, opts) {
    const maxSide = (opts && opts.maxSide) || 2000;
    const [tl, tr, br, bl] = corners;
    let w = Math.max(dist(tl, tr), dist(bl, br));
    let h = Math.max(dist(tl, bl), dist(tr, br));
    const est = estimateAspect(corners, img.width, img.height);
    if (est) { // conserve la plus grande dimension mesurée, corrige l'autre
      if (est >= w / h) h = w / est; else w = h * est;
    }
    const landscape = w >= h;
    const ratio = landscape ? w / h : h / w;
    const snap = CARD_RATIOS.reduce((a, r) => (Math.abs(r - ratio) < Math.abs(a - ratio) ? r : a));
    if (Math.abs(snap - ratio) / ratio < 0.04) {
      if (landscape) h = w / snap; else w = h / snap;
    }
    const k = Math.min(1, maxSide / Math.max(w, h));
    const W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k));
    // Marge de 1 % : on rogne les bords de la carte (liseré de fond, coins arrondis).
    const ix = W * 0.01, iy = H * 0.01;
    const hm = homography([{ x: -ix, y: -iy }, { x: W + ix, y: -iy }, { x: W + ix, y: H + iy }, { x: -ix, y: H + iy }], corners);
    const out = newImage(W, H);
    const { data: sd, width: sw, height: sh } = img;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = x + 0.5, py = y + 0.5;
        const d = hm[6] * px + hm[7] * py + 1;
        const sx = (hm[0] * px + hm[1] * py + hm[2]) / d - 0.5;
        const sy = (hm[3] * px + hm[4] * py + hm[5]) / d - 0.5;
        const x0 = clamp(Math.floor(sx), 0, sw - 1), y0 = clamp(Math.floor(sy), 0, sh - 1);
        const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
        const fx = clamp(sx - x0, 0, 1), fy = clamp(sy - y0, 0, 1);
        const o = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) {
          const top = sd[(y0 * sw + x0) * 4 + c] * (1 - fx) + sd[(y0 * sw + x1) * 4 + c] * fx;
          const bot = sd[(y1 * sw + x0) * 4 + c] * (1 - fx) + sd[(y1 * sw + x1) * 4 + c] * fx;
          out.data[o + c] = top * (1 - fy) + bot * fy;
        }
        out.data[o + 3] = 255;
      }
    }
    return out;
  }

  function rotate90(img, times) {
    let cur = img;
    for (let t = ((times % 4) + 4) % 4; t > 0; t--) {
      const { width: w, height: h, data } = cur;
      const out = newImage(h, w);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const s = (y * w + x) * 4, d = (x * h + (h - 1 - y)) * 4; // 90° horaire
          out.data[d] = data[s]; out.data[d + 1] = data[s + 1]; out.data[d + 2] = data[s + 2]; out.data[d + 3] = 255;
        }
      cur = out;
    }
    return cur;
  }

  /* ---------- amélioration de la qualité ---------- */

  // Estimation du fond (éclairage) : max local puis flou, calculée en basse résolution.
  function estimateBackground(lum, w, h) {
    const f = Math.max(1, Math.round(Math.min(w, h) / 100));
    const sw = Math.max(2, Math.ceil(w / f)), sh = Math.max(2, Math.ceil(h / f));
    const small = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        let s = 0, n = 0;
        for (let yy = y * f; yy < Math.min(h, (y + 1) * f); yy++)
          for (let xx = x * f; xx < Math.min(w, (x + 1) * f); xx++) { s += lum[yy * w + xx]; n++; }
        small[y * sw + x] = s / n;
      }
    const bgSmall = boxBlur(maxFilter(small, sw, sh, 3), sw, sh, 2);
    const bg = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = clamp((y + 0.5) / f - 0.5, 0, sh - 1), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = clamp((x + 0.5) / f - 0.5, 0, sw - 1), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
        bg[y * w + x] =
          (bgSmall[y0 * sw + x0] * (1 - tx) + bgSmall[y0 * sw + x1] * tx) * (1 - ty) +
          (bgSmall[y1 * sw + x0] * (1 - tx) + bgSmall[y1 * sw + x1] * tx) * ty;
      }
    }
    return bg;
  }

  function sharpen(plane, w, h, amount) {
    const blur = boxBlur(boxBlur(plane, w, h, 1), w, h, 1);
    const out = new Float32Array(plane.length);
    for (let i = 0; i < out.length; i++) out[i] = (plane[i] - blur[i]) * amount;
    return out; // détail à ajouter
  }

  /**
   * @param mode 'original' | 'color' | 'document' | 'gray'
   * @param opts { sharpen: bool }
   */
  function enhance(img, mode, opts) {
    const { width: w, height: h, data } = img;
    const out = newImage(w, h);
    if (mode === 'original') { out.data.set(data); return out; }
    const doSharpen = !opts || opts.sharpen !== false;

    const lum = toGray(img);
    const bg = estimateBackground(lum, w, h);
    const bgMedian = percentileOf(bg, 0.5);
    const flatten = bgMedian > 100; // fond clair : on peut normaliser l'éclairage

    if (mode === 'document') {
      // Texte noir sur fond blanc, bords adoucis.
      const norm = new Float32Array(w * h);
      for (let i = 0; i < norm.length; i++) norm[i] = flatten ? clamp((lum[i] / Math.max(bg[i], 1)) * 255, 0, 255) : lum[i];
      const lo = percentileOf(norm, 0.02), hi = Math.max(lo + 20, percentileOf(norm, 0.6));
      for (let i = 0; i < norm.length; i++) {
        const t = clamp((norm[i] - lo) / (hi - lo), 0, 1);
        const v = t * t * (3 - 2 * t) * 255;
        const o = i * 4;
        out.data[o] = out.data[o + 1] = out.data[o + 2] = v; out.data[o + 3] = 255;
      }
      return out;
    }

    // Gain d'éclairage par pixel (couleur conservée).
    const gain = new Float32Array(w * h);
    const target = percentileOf(bg, 0.95);
    for (let i = 0; i < gain.length; i++) gain[i] = flatten ? clamp(target / Math.max(bg[i], 1), 0.7, 3) : 1;

    const planes = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
    const nl = new Float32Array(w * h);
    for (let i = 0, j = 0; i < nl.length; i++, j += 4) {
      const gn = mode === 'gray' ? null : gain[i];
      if (mode === 'gray') {
        planes[0][i] = planes[1][i] = planes[2][i] = clamp(lum[i] * gain[i], 0, 255);
      } else {
        planes[0][i] = data[j] * gn; planes[1][i] = data[j + 1] * gn; planes[2][i] = data[j + 2] * gn;
      }
      nl[i] = 0.299 * planes[0][i] + 0.587 * planes[1][i] + 0.114 * planes[2][i];
    }
    // étirement des niveaux
    const lo = percentileOf(nl, 0.005);
    const hi = Math.max(lo + 30, percentileOf(nl, 0.995));
    const k = 255 / (hi - lo);
    const detail = doSharpen ? sharpen(nl, w, h, 0.5) : null;
    for (let i = 0; i < nl.length; i++) {
      const d = detail ? detail[i] : 0;
      const o = i * 4;
      for (let c = 0; c < 3; c++) out.data[o + c] = (planes[c][i] - lo) * k + d;
      out.data[o + 3] = 255;
    }
    return out;
  }

  // Variance du laplacien : < ~60 sur une carte ≈ photo floue (échelle 480 px).
  function sharpness(img) {
    const { img: small } = resize(img, 480);
    const w = small.width, h = small.height;
    const g = toGray(small);
    let sum = 0, sum2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
        sum += l; sum2 += l * l; n++;
      }
    const mean = sum / n;
    return sum2 / n - mean * mean;
  }

  return { detectCard, warpCard, enhance, sharpness, rotate90, orderCorners, homography, resize };
});
