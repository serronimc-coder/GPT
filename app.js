(function () {
  'use strict';

  const MAX_SOURCE = 3000;       // plus grande dimension conservée pour une photo source
  const BLUR_THRESHOLD = 50;     // variance du laplacien en dessous de laquelle on prévient
  const $ = (id) => document.getElementById(id);

  const state = {
    queue: [],         // photos à traiter (File)
    qi: 0,             // index de la photo en cours dans la file
    source: null,      // photo en cours { data, width, height }
    cards: [],         // quadrilatères de la photo en cours (chacun : 4 coins TL,TR,BR,BL)
    sel: 0,            // carte sélectionnée dans l'écran de recadrage
    results: [],       // cartes scannées : { warped, rotation, blurry, enhanced }
    mode: 'color',
  };

  /* ---------- navigation ---------- */
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    window.scrollTo(0, 0);
  }
  function setStatus(msg) { $('status').textContent = msg || ''; }

  /* ---------- chargement des photos ---------- */
  async function decode(file) {
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
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w0 * k); canvas.height = Math.round(h0 * k);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  }

  function startBatch(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    state.queue = files;
    state.qi = 0;
    nextPhoto();
  }

  // Passe à la photo suivante de la file ; affiche les résultats quand elle est vide.
  async function nextPhoto() {
    if (state.qi >= state.queue.length) {
      if (state.results.length) { renderGrid(); show('result'); } else show('home');
      return;
    }
    try {
      state.source = await decode(state.queue[state.qi]);
    } catch (e) {
      setStatus('Photo illisible : ' + state.queue[state.qi].name);
      state.qi++;
      return nextPhoto();
    }
    runDetection();
    show('crop');
  }

  function runDetection() {
    const det = Scanner.detectCards(state.source);
    state.cards = det.corners;
    state.sel = 0;
    $('crop-title').textContent = state.queue.length > 1 ? `Photo ${state.qi + 1} sur ${state.queue.length}` : '';
    updateHint(det.detected);
    drawCrop();
  }

  function updateHint(detected) {
    const n = state.cards.length;
    $('crop-hint').textContent = detected === false
      ? 'Carte non détectée : placez les 4 coins sur les angles de la carte.'
      : n > 1
        ? `${n} cartes détectées. Touchez une carte pour la sélectionner, glissez ses coins pour affiner.`
        : 'Carte détectée. Glissez les coins pour affiner si besoin.';
    $('card-del').disabled = n <= 1;
  }

  /* ---------- écran de recadrage ---------- */
  const cropCanvas = $('crop-canvas');
  let view = { scale: 1 };      // affichage = source * scale
  let dragging = -1;
  const HANDLE_R = 14;

  function drawCrop() {
    const src = state.source;
    if (!src || !state.cards.length) return;
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
    const quads = state.cards.map((q) => q.map((p) => ({ x: p.x * view.scale, y: p.y * view.scale })));
    // assombrit tout ce qui n'est dans aucune carte
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    quads.forEach((pts) => {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 3; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
    });
    ctx.fill('evenodd');
    quads.forEach((pts, qi) => {
      const on = qi === state.sel;
      ctx.strokeStyle = on ? '#38bdf8' : 'rgba(255,255,255,.8)';
      ctx.lineWidth = on ? 3 : 1.5;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
      if (quads.length > 1) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4;
        ctx.fillStyle = on ? '#38bdf8' : 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#082f49'; ctx.font = '600 14px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(qi + 1), cx, cy + 1);
      }
      if (on) {
        pts.forEach((p) => {
          ctx.beginPath(); ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56,189,248,.35)'; ctx.fill(); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.stroke();
        });
      }
    });
  }

  function pointerPos(e) {
    const r = cropCanvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.scale, y: (e.clientY - r.top) / view.scale };
  }
  cropCanvas.addEventListener('pointerdown', (e) => {
    const p = pointerPos(e);
    const quad = state.cards[state.sel];
    let best = -1, bd = (HANDLE_R * 2.5) / view.scale;
    quad.forEach((c, i) => { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { dragging = best; cropCanvas.setPointerCapture(e.pointerId); return; }
    const hit = state.cards.findIndex((q) => Scanner.pointInQuad(p, q));
    if (hit >= 0 && hit !== state.sel) { state.sel = hit; drawCrop(); }
  });
  cropCanvas.addEventListener('pointermove', (e) => {
    if (dragging < 0) return;
    const p = pointerPos(e);
    state.cards[state.sel][dragging] = {
      x: Math.min(state.source.width - 1, Math.max(0, p.x)),
      y: Math.min(state.source.height - 1, Math.max(0, p.y)),
    };
    drawCrop();
  });
  const endDrag = () => { dragging = -1; };
  cropCanvas.addEventListener('pointerup', endDrag);
  cropCanvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => { if ($('screen-crop').classList.contains('active')) drawCrop(); });

  $('card-add').addEventListener('click', () => {
    const { width: w, height: h } = state.source;
    const cx = w / 2, cy = h / 2, hw = w * 0.2, hh = hw * 0.57;
    state.cards.push([{ x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh }, { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh }]);
    state.sel = state.cards.length - 1;
    updateHint(); drawCrop();
  });
  $('card-del').addEventListener('click', () => {
    if (state.cards.length <= 1) return;
    state.cards.splice(state.sel, 1);
    state.sel = Math.min(state.sel, state.cards.length - 1);
    updateHint(); drawCrop();
  });
  $('crop-auto').addEventListener('click', runDetection);

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

  async function validatePhoto() {
    const bad = state.cards.findIndex((q) => !isConvex(q));
    if (bad >= 0) {
      state.sel = bad; drawCrop();
      $('crop-hint').textContent = `Les coins de la carte ${bad + 1} se croisent : replacez-les dans l'ordre autour de la carte.`;
      return;
    }
    $('crop-ok').disabled = true;
    await new Promise((r) => setTimeout(r)); // laisse le navigateur afficher l'état
    for (const quad of state.cards) {
      const warped = Scanner.warpCard(state.source, quad);
      state.results.push({ warped, rotation: 0, blurry: Scanner.sharpness(warped) < BLUR_THRESHOLD, enhanced: null });
    }
    $('crop-ok').disabled = false;
    state.qi++;
    nextPhoto();
  }

  /* ---------- galerie des résultats ---------- */
  function enhanceCard(r) {
    r.enhanced = Scanner.enhance(Scanner.rotate90(r.warped, r.rotation), state.mode);
  }

  function renderGrid() {
    const grid = $('grid');
    grid.textContent = '';
    state.results.forEach((r, i) => {
      if (!r.enhanced) enhanceCard(r);
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;
      const canvas = document.createElement('canvas');
      const cap = document.createElement('div');
      cap.className = 'cap';
      const label = document.createElement('span');
      label.textContent = `Carte ${i + 1}`;
      cap.appendChild(label);
      if (r.blurry) {
        const b = document.createElement('span');
        b.className = 'badge'; b.textContent = '⚠️ floue';
        cap.appendChild(b);
      }
      const actions = document.createElement('div');
      actions.className = 'actions';
      const rot = mini('⟳', 'Pivoter', () => { r.rotation = (r.rotation + 1) % 4; enhanceCard(r); paint(canvas, r.enhanced); });
      const del = mini('✕', 'Supprimer', () => { state.results.splice(state.results.indexOf(r), 1); state.results.length ? renderGrid() : show('home'); });
      const save = mini('💾 Enregistrer', 'Enregistrer cette carte', async () => { await saveOne(r, i); });
      save.classList.add('save');
      actions.append(rot, del, save);
      cell.append(canvas, cap, actions);
      grid.appendChild(cell);
      paint(canvas, r.enhanced);
    });
    const n = state.results.length;
    $('result-title').textContent = n > 1 ? `${n} cartes scannées` : 'Carte scannée';
    $('save-all').textContent = n > 1 ? `💾 Tout enregistrer (${n}) dans Photos` : '💾 Enregistrer dans Photos';
    setStatus('');
  }

  function mini(text, label, onClick) {
    const b = document.createElement('button');
    b.className = 'mini'; b.textContent = text; b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  }

  function paint(canvas, img) {
    canvas.width = img.width; canvas.height = img.height;
    canvas.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  }

  /* ---------- enregistrement ---------- */
  function toBlob(img) {
    const c = document.createElement('canvas');
    paint(c, img);
    return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.93));
  }
  function fileName(i) {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `carte-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${i + 1}.jpg`;
  }

  // <save-impl>
  // Un site web ne peut pas écrire directement dans la photothèque : on passe par la
  // feuille de partage du système (« Enregistrer l'image » sur iOS, Galerie sur Android).
  // Résout true si l'image a été confirmée, false si l'utilisateur a refusé.
  async function saveBlob(blob, name) {
    const file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Carte de visite' }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; throw e; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return true;
  }
  // </save-impl>

  async function saveOne(r, i) {
    try {
      if (await saveBlob(await toBlob(r.enhanced), fileName(i))) setStatus(`Carte ${i + 1} : choisissez « Enregistrer l'image » pour l'ajouter à Photos.`);
    } catch (e) { setStatus('Enregistrement impossible : ' + (e.message || e.code)); }
  }

  // Une confirmation par image : le système n'accepte pas plusieurs fichiers à la fois ici.
  async function saveAll() {
    const total = state.results.length;
    let done = 0;
    $('save-all').disabled = true;
    try {
      for (let i = 0; i < total; i++) {
        setStatus(`Enregistrement ${i + 1} sur ${total}…`);
        if (!(await saveBlob(await toBlob(state.results[i].enhanced), fileName(i)))) break;
        done++;
      }
      setStatus(done === total ? `${done} carte${done > 1 ? 's' : ''} enregistrée${done > 1 ? 's' : ''}.` : `${done} sur ${total} enregistrées. Touchez « Enregistrer » sous les cartes restantes.`);
    } catch (e) {
      setStatus(`${done} sur ${total} enregistrées. ${e.message || e.code || ''}`);
    }
    $('save-all').disabled = false;
  }

  /* ---------- événements ---------- */
  // Les photos ajoutées s'ajoutent aux cartes déjà scannées.
  function onFiles(e) { startBatch(e.target.files); e.target.value = ''; }
  $('file-camera').addEventListener('change', onFiles);
  $('file-gallery').addEventListener('change', onFiles);
  $('file-more').addEventListener('change', onFiles);
  $('crop-cancel').addEventListener('click', () => { state.qi++; nextPhoto(); });
  $('crop-ok').addEventListener('click', validatePhoto);
  $('again').addEventListener('click', () => { state.results = []; show('home'); });
  $('save-all').addEventListener('click', saveAll);
  document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
    state.mode = chip.dataset.mode;
    document.querySelectorAll('.chip').forEach((c) => {
      const on = c === chip;
      c.classList.toggle('active', on); c.setAttribute('aria-checked', String(on));
    });
    state.results.forEach((r) => { r.enhanced = null; });
    renderGrid();
  }));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
