(function () {
  'use strict';

  const MAX_SOURCE = 3000;       // plus grande dimension conservée pour la photo source
  const BLUR_THRESHOLD = 50;     // variance du laplacien en dessous de laquelle on prévient
  const $ = (id) => document.getElementById(id);

  const state = {
    source: null,      // image source { data, width, height }
    corners: null,     // coins TL,TR,BR,BL en pixels de la source
    detected: false,
    warped: null,      // carte redressée (avant amélioration)
    rotation: 0,       // quarts de tour
    mode: 'color',
    result: null,      // image finale affichée
  };

  /* ---------- navigation ---------- */
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    window.scrollTo(0, 0);
  }
  function setStatus(msg) { $('status').textContent = msg || ''; }

  /* ---------- chargement de la photo ---------- */
  async function loadFile(file) {
    if (!file) return;
    const canvas = document.createElement('canvas');
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      bitmap = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img); img.onerror = rej;
        img.src = URL.createObjectURL(file);
      });
    }
    const w0 = bitmap.width || bitmap.naturalWidth, h0 = bitmap.height || bitmap.naturalHeight;
    const k = Math.min(1, MAX_SOURCE / Math.max(w0, h0));
    canvas.width = Math.round(w0 * k); canvas.height = Math.round(h0 * k);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    state.source = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    state.rotation = 0;
    runDetection();
    show('crop');
  }

  function runDetection() {
    const det = Scanner.detectCard(state.source);
    state.corners = det.corners;
    state.detected = det.detected;
    $('crop-hint').textContent = det.detected
      ? 'Carte détectée. Glissez les coins pour affiner si besoin.'
      : 'Carte non détectée : placez les 4 coins sur les angles de la carte.';
    drawCrop();
  }

  /* ---------- écran de recadrage ---------- */
  const cropCanvas = $('crop-canvas');
  let view = { scale: 1 };      // affichage = source * scale
  let dragging = -1;
  const HANDLE_R = 14;

  function drawCrop() {
    const src = state.source;
    if (!src) return;
    const maxW = Math.min(window.innerWidth - 48, 600);
    const maxH = Math.max(240, window.innerHeight * 0.6);
    view.scale = Math.min(maxW / src.width, maxH / src.height);
    const W = Math.round(src.width * view.scale), H = Math.round(src.height * view.scale);
    const dpr = window.devicePixelRatio || 1;
    cropCanvas.width = W * dpr; cropCanvas.height = H * dpr;
    cropCanvas.style.width = W + 'px'; cropCanvas.style.height = H + 'px';
    const ctx = cropCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!view.bitmapCanvas || view.bitmapCanvas.srcRef !== src) {
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d').putImageData(src, 0, 0);
      c.srcRef = src;
      view.bitmapCanvas = c;
    }
    ctx.drawImage(view.bitmapCanvas, 0, 0, W, H);
    const pts = state.corners.map((p) => ({ x: p.x * view.scale, y: p.y * view.scale }));
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 3; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath(); ctx.fill('evenodd');
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
    pts.forEach((p) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56,189,248,.35)'; ctx.fill(); ctx.stroke();
    });
  }

  function pointerPos(e) {
    const r = cropCanvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.scale, y: (e.clientY - r.top) / view.scale };
  }
  cropCanvas.addEventListener('pointerdown', (e) => {
    const p = pointerPos(e);
    let best = -1, bd = (HANDLE_R * 2.5) / view.scale;
    state.corners.forEach((c, i) => { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { dragging = best; cropCanvas.setPointerCapture(e.pointerId); }
  });
  cropCanvas.addEventListener('pointermove', (e) => {
    if (dragging < 0) return;
    const p = pointerPos(e);
    state.corners[dragging] = {
      x: Math.min(state.source.width - 1, Math.max(0, p.x)),
      y: Math.min(state.source.height - 1, Math.max(0, p.y)),
    };
    drawCrop();
  });
  const endDrag = () => { dragging = -1; };
  cropCanvas.addEventListener('pointerup', endDrag);
  cropCanvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => { if ($('screen-crop').classList.contains('active')) drawCrop(); });

  /* ---------- redressement + amélioration ---------- */
  function isConvex(c) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4], d = c[(i + 2) % 4];
      const cr = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
      if (cr === 0) return false;
      if (sign && Math.sign(cr) !== sign) return false;
      sign = Math.sign(cr);
    }
    return true;
  }

  function process() {
    if (!isConvex(state.corners)) {
      $('crop-hint').textContent = 'Les coins se croisent : replacez-les dans l\'ordre autour de la carte.';
      return;
    }
    state.warped = Scanner.warpCard(state.source, state.corners);
    state.rotation = 0;
    const blurry = Scanner.sharpness(state.warped) < BLUR_THRESHOLD;
    const warn = $('quality-warn');
    warn.hidden = !blurry;
    warn.textContent = blurry ? '⚠️ Photo un peu floue : reprenez-la plus près, avec plus de lumière, en stabilisant le téléphone.' : '';
    renderResult();
    show('result');
  }

  function renderResult() {
    const rotated = Scanner.rotate90(state.warped, state.rotation);
    state.result = Scanner.enhance(rotated, state.mode);
    const c = $('result-canvas');
    c.width = state.result.width; c.height = state.result.height;
    c.getContext('2d').putImageData(new ImageData(state.result.data, state.result.width, state.result.height), 0, 0);
    setStatus('');
  }

  /* ---------- enregistrement ---------- */
  function resultBlob() {
    return new Promise((res) => $('result-canvas').toBlob(res, 'image/jpeg', 0.93));
  }
  function fileName() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `carte-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
  }
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  // Un site web ne peut pas écrire directement dans la photothèque : on passe par la
  // feuille de partage du système (« Enregistrer l'image » sur iOS, Galerie sur Android).
  async function saveToPhotos() {
    const blob = await resultBlob();
    const file = new File([blob], fileName(), { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Carte de visite' });
        setStatus('Choisissez « Enregistrer l\'image » pour l\'ajouter à Photos.');
      } catch (e) {
        if (e.name !== 'AbortError') setStatus('Partage impossible : ' + e.message);
      }
      return;
    }
    downloadBlob(blob, file.name);
    setStatus('Image téléchargée (dossier Téléchargements / galerie de votre appareil).');
  }

  /* ---------- événements ---------- */
  $('file-camera').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('file-gallery').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('crop-cancel').addEventListener('click', () => show('home'));
  $('crop-auto').addEventListener('click', runDetection);
  $('crop-ok').addEventListener('click', process);
  $('back-crop').addEventListener('click', () => { show('crop'); drawCrop(); });
  $('again').addEventListener('click', () => show('home'));
  $('rotate').addEventListener('click', () => { state.rotation = (state.rotation + 1) % 4; renderResult(); });
  $('save').addEventListener('click', saveToPhotos);
  $('download').addEventListener('click', async () => { downloadBlob(await resultBlob(), fileName()); setStatus('Fichier téléchargé.'); });
  document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
    state.mode = chip.dataset.mode;
    document.querySelectorAll('.chip').forEach((c) => {
      const on = c === chip;
      c.classList.toggle('active', on); c.setAttribute('aria-checked', String(on));
    });
    renderResult();
  }));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
