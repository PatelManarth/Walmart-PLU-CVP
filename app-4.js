'use strict';
// Search bindings
$('#searchInput').addEventListener('input', e => { state.query = e.target.value; $('#clearSearch').classList.toggle('hidden', !state.query); renderResults(); });
$('#clearSearch').addEventListener('click', () => { state.query = ''; $('#searchInput').value = ''; $('#clearSearch').classList.add('hidden'); state.filter = 'All'; renderChips(); renderResults(); $('#searchInput').focus(); });
$$('.quick-search').forEach(btn => btn.addEventListener('click', () => setSearch(btn.dataset.query)));
$('#showAll').addEventListener('click', () => {
  if (state.query) { $('#clearSearch').click(); return; }
  $('#resultTitle').textContent = 'All produce'; $('#resultMeta').textContent = `${ITEMS.length} entries from Q3 2026 sheet`;
  $('#results').innerHTML = [...ITEMS].sort((a,b) => a.name.localeCompare(b.name)).map(resultCard).join('');
  $$('.product-card').forEach(card => card.addEventListener('click', () => openDetail(byId(card.dataset.id))));
  hydrateReferenceThumbs(ITEMS);
});

// Continuous voice lookup with graceful fallback.
// One tap turns the mic mode on; it keeps listening/restarting until the user taps it off.
// Some mobile browsers end a SpeechRecognition session after silence or when another media
// surface opens, so "continuous" is implemented as a user-controlled mode plus safe auto-restart.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceRecognition = null;
let voiceWanted = false;
let voiceRunning = false;
let voiceRestartTimer = null;
let voicePausedForCamera = false;
let lastVoiceError = '';

function updateVoiceButton() {
  const btn = $('#voiceSearch');
  if (!btn) return;
  btn.classList.toggle('listening', voiceWanted);
  btn.textContent = voiceWanted ? '⏹️' : '🎙️';
  btn.setAttribute('aria-label', voiceWanted ? 'Turn off continuous voice lookup' : 'Turn on continuous voice lookup');
  btn.title = voiceWanted ? 'Mic on — tap to stop' : 'Continuous voice lookup';
}

function rankVoiceAlternatives(result) {
  const alternatives = [...result].map(x => x.transcript?.trim()).filter(Boolean);
  let best = alternatives[0] || '';
  let bestScore = -Infinity;
  for (const phrase of alternatives) {
    const score = Math.max(...ITEMS.map(item => searchScore(item, phrase)));
    if (score > bestScore) { bestScore = score; best = phrase; }
  }
  return best;
}

function scheduleVoiceRestart(delay = 260) {
  clearTimeout(voiceRestartTimer);
  if (!voiceWanted || voicePausedForCamera || document.hidden) return;
  voiceRestartTimer = setTimeout(() => startVoiceRecognition(), delay);
}

function makeVoiceRecognition() {
  const rec = new SR();
  rec.lang = 'en-CA';
  rec.interimResults = false;
  rec.continuous = true;
  rec.maxAlternatives = 4;

  rec.onstart = () => {
    voiceRunning = true;
    lastVoiceError = '';
    updateVoiceButton();
  };

  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (!result.isFinal) continue;
      const phrase = rankVoiceAlternatives(result);
      if (phrase) parseVoiceCommand(phrase);
    }
  };

  rec.onerror = e => {
    voiceRunning = false;
    lastVoiceError = e.error || '';
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      voiceWanted = false;
      updateVoiceButton();
      toast('Microphone permission denied');
      return;
    }
    // no-speech and aborted are normal during long sessions / camera transitions.
    if (!['no-speech','aborted'].includes(e.error || '') && voiceWanted) {
      toast('Voice paused — reconnecting…');
    }
  };

  rec.onend = () => {
    voiceRunning = false;
    updateVoiceButton();
    if (voiceWanted) scheduleVoiceRestart(lastVoiceError === 'network' ? 1200 : 280);
  };
  return rec;
}

function startVoiceRecognition() {
  if (!SR || !voiceWanted || voiceRunning || voicePausedForCamera || document.hidden) return;
  clearTimeout(voiceRestartTimer);
  if (!voiceRecognition) voiceRecognition = makeVoiceRecognition();
  try {
    voiceRecognition.start();
  } catch {
    scheduleVoiceRestart(500);
  }
}

function turnVoiceOn() {
  if (!SR) {
    toast('Voice recognition is not supported in this browser. Type search still works.');
    return;
  }
  if (voiceWanted) return;
  voiceWanted = true;
  updateVoiceButton();
  toast('Continuous mic ON — say produce names; tap ⏹️ to stop');
  startVoiceRecognition();
}

function turnVoiceOff(showToast = true) {
  voiceWanted = false;
  voicePausedForCamera = false;
  clearTimeout(voiceRestartTimer);
  voiceRestartTimer = null;
  try { voiceRecognition?.stop(); } catch {}
  updateVoiceButton();
  if (showToast) toast('Continuous mic OFF');
}

function pauseVoiceForCamera() {
  if (!voiceWanted) return;
  voicePausedForCamera = true;
  clearTimeout(voiceRestartTimer);
  try { voiceRecognition?.abort(); } catch {}
}

function resumeVoiceAfterCamera() {
  if (!voiceWanted) return;
  voicePausedForCamera = false;
  scheduleVoiceRestart(220);
}

$('#voiceSearch').addEventListener('click', () => {
  if (voiceWanted) turnVoiceOff();
  else turnVoiceOn();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && voiceWanted && !voicePausedForCamera) scheduleVoiceRestart(250);
});
updateVoiceButton();

// Camera / barcode assist.
async function openCameraDialog() { pauseVoiceForCamera(); $('#cameraDialog').showModal(); $('#cameraStatus').textContent = ('BarcodeDetector' in window) ? 'Ready — start live scan' : 'Live barcode detection may be unavailable here; camera/photo fallback still works'; }

async function startCamera() {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) { toast('Camera access is unavailable in this browser'); return; }
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const video = $('#cameraVideo'); video.srcObject = state.cameraStream; await video.play();
    $('#cameraStatus').textContent = ('BarcodeDetector' in window) ? 'Scanning… hold sticker steady' : 'Camera open — automatic barcode reading is not supported here';
    if ('BarcodeDetector' in window) beginBarcodeLoop();
  } catch (e) { $('#cameraStatus').textContent = 'Camera permission unavailable'; toast('Could not open camera'); }
}

function stopCamera() {
  clearTimeout(state.cameraTimer); state.cameraTimer = null;
  state.cameraStream?.getTracks?.().forEach(t => t.stop()); state.cameraStream = null;
  const video = $('#cameraVideo'); if (video) video.srcObject = null;
  if ($('#cameraStatus')) $('#cameraStatus').textContent = 'Camera stopped';
  // If the camera dialog has fully closed, return to continuous voice mode automatically.
  if (!$('#cameraDialog')?.open) resumeVoiceAfterCamera();
}

async function beginBarcodeLoop() {
  let detector;
  try {
    const supported = await BarcodeDetector.getSupportedFormats?.();
    const wanted = ['ean_13','ean_8','upc_a','upc_e','code_128','qr_code'];
    const formats = supported?.length ? wanted.filter(x => supported.includes(x)) : undefined;
    detector = formats?.length ? new BarcodeDetector({ formats }) : new BarcodeDetector();
  } catch { return; }
  const tick = async () => {
    if (!state.cameraStream || !$('#cameraVideo').videoWidth) { state.cameraTimer = setTimeout(tick, 400); return; }
    try {
      const codes = await detector.detect($('#cameraVideo'));
      if (codes?.length) { handleScannedCode(codes[0].rawValue); return; }
    } catch {}
    state.cameraTimer = setTimeout(tick, 380);
  };
  tick();
}

function handleScannedCode(raw) {
  const value = canonicalBarcode(raw); if (!value) return;
  const exact = ITEMS.filter(x => x.plu === value);
  $('#scanResult').classList.remove('hidden');
  if (exact.length === 1) {
    $('#scanResult').innerHTML = `<strong>PLU ${esc(value)} matched:</strong> ${esc(exact[0].name)} • ${exact[0].unit}`;
    stopCamera(); haptic(30); setTimeout(() => { $('#cameraDialog').close(); openDetail(exact[0]); }, 450);
    return;
  }
  if (exact.length > 1) {
    $('#scanResult').innerHTML = `<strong>PLU ${esc(value)} has ${exact.length} chart matches:</strong> ${exact.map(x => esc(x.name)).join(' • ')}. Search the PLU and confirm the product name.`;
    stopCamera(); setSearch(value); $('#cameraDialog').close();
    return;
  }

  const mapped = resolveBarcode(value);
  if (mapped) {
    const label = mapped.source === 'built-in' ? 'verified built-in mapping' : 'your saved mapping';
    $('#scanResult').innerHTML = `<strong>Barcode ${esc(value)}</strong><br>→ ${esc(mapped.item.name)} • <strong>PLU ${esc(mapped.item.plu)}</strong> • ${mapped.item.unit}<br><span class="muted">Matched using ${label}.</span>`;
    stopCamera(); haptic(30); setTimeout(() => { $('#cameraDialog').close(); openDetail(mapped.item); }, 550);
    return;
  }

  state.pendingBarcode = value;
  $('#scanResult').innerHTML = `<strong>Barcode read:</strong> ${esc(value)}<br><span class="muted">No mapping yet. Confirm the product once, save the mapping, and future scans of this barcode will jump straight to its PLU.</span><div class="scan-map-actions"><button id="mapScannedBarcode" class="primary-btn" type="button">Map this barcode → PLU</button></div>`;
  $('#cameraStatus').textContent = 'Barcode read — needs one-time mapping';
  $('#mapScannedBarcode').addEventListener('click', () => openBarcodeMapper(value));
}

function openBarcodeMapper(raw) {
  state.pendingBarcode = canonicalBarcode(raw);
  if (!state.pendingBarcode) return;
  pauseVoiceForCamera();
  stopCamera();
  if ($('#cameraDialog').open) $('#cameraDialog').close();
  // Keep voice paused while the one-time barcode mapping dialog is open.
  pauseVoiceForCamera();
  $('#mapBarcodeValue').textContent = state.pendingBarcode;
  $('#mapSearch').value = '';
  renderBarcodeMapResults('');
  $('#barcodeMapDialog').showModal();
  setTimeout(() => $('#mapSearch').focus(), 50);
}

function renderBarcodeMapResults(query) {
  const q = String(query || '').trim();
  let items;
  if (!q) items = [...quickIds.map(byId).filter(Boolean), ...frequentItems(6)].filter((x,i,a) => a.findIndex(y => y.id === x.id) === i).slice(0, 12);
  else items = ITEMS.map(item => ({item, score: searchScore(item, q)})).filter(x => x.score >= 0).sort((a,b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).slice(0, 30).map(x => x.item);
  $('#mapResults').innerHTML = items.length ? items.map(item => `<button class="map-result" data-map-id="${item.id}" type="button"><span><strong>${esc(item.name)}</strong><small>${esc(item.plu)} • ${item.unit}</small></span><span>Map →</span></button>`).join('') : '<div class="empty compact"><p>No product match. Search by name, alias, or PLU.</p></div>';
  $$('[data-map-id]', $('#mapResults')).forEach(btn => btn.addEventListener('click', () => {
    const item = byId(btn.dataset.mapId);
    if (!item) return;
    if (saveBarcodeMapping(state.pendingBarcode, item)) {
      const code = state.pendingBarcode;
      state.pendingBarcode = '';
      $('#barcodeMapDialog').close();
      toast(`Barcode ${code} → PLU ${item.plu} saved`);
      openDetail(item);
    }
  }));
}

function renderBarcodeManager() {
  const rows = localPrimaryMappings();
  const count = $('#barcodeMappingCount');
  if (!count) return;
  count.textContent = `${rows.length} saved barcode mapping${rows.length === 1 ? '' : 's'} on this device`;
  const list = $('#barcodeMappingList');
  list.innerHTML = rows.length ? rows.slice(0, 10).map(row => `<div class="mapping-row"><span><strong>${esc(row.barcode)}</strong><small>${esc(row.item.name)} • PLU ${esc(row.item.plu)} • ${row.item.unit}</small></span><button data-remove-map="${esc(row.barcode)}" type="button">Remove</button></div>`).join('') : '<div class="muted">No saved mappings yet. Scan a sticker barcode and confirm the product once.</div>';
  $$('[data-remove-map]', list).forEach(btn => btn.addEventListener('click', () => { removeBarcodeMapping(btn.dataset.removeMap); toast('Mapping removed'); renderBarcodeManager(); }));
}

function exportBarcodeMappings() {
  const payload = {
    format: 'produce-cvp-barcode-mappings-v1',
    exportedAt: new Date().toISOString(),
    dataVersion: DB.meta.version,
    mappings: localPrimaryMappings().map(row => ({ barcode: row.barcode, itemId: row.item.id, plu: row.item.plu, name: row.item.name }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `produce-cvp-barcode-mappings-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Barcode mappings exported');
}

async function importBarcodeMappings(file) {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const mappings = Array.isArray(payload) ? payload : payload.mappings;
    if (!Array.isArray(mappings)) throw new Error('bad format');
    let imported = 0;
    for (const row of mappings) {
      const barcode = canonicalBarcode(row?.barcode);
      const item = byId(row?.itemId) || ITEMS.find(x => x.plu === String(row?.plu || '') && (!row?.name || x.name === row.name));
      if (!barcode || !item) continue;
      const record = { itemId: item.id, primary: barcode, plu: item.plu, name: item.name, confirmedAt: Date.now() };
      for (const variant of barcodeVariants(barcode)) state.barcodeMappings[variant] = record;
      imported++;
    }
    save(STORAGE.barcodeMappings, state.barcodeMappings);
    renderBarcodeManager();
    toast(`${imported} barcode mapping${imported === 1 ? '' : 's'} imported`);
  } catch { toast('Could not import that mapping file'); }
}

async function scanBarcodePhoto(file) {
  if (!file) return;
  if (!('BarcodeDetector' in window)) { toast('Automatic barcode reading is unavailable in this browser'); return; }
  try {
    const detector = new BarcodeDetector();
    const bitmap = await createImageBitmap(file);
    const codes = await detector.detect(bitmap); bitmap.close?.();
    if (codes?.length) handleScannedCode(codes[0].rawValue); else toast('No barcode detected in that photo');
  } catch { toast('Could not scan that photo'); }
}

function setMysteryPhoto(file) {
  if (!file) return;
  if (state.mysteryPhotoUrl) URL.revokeObjectURL(state.mysteryPhotoUrl);
  state.mysteryPhotoUrl = URL.createObjectURL(file);
  $('#mysteryPhoto').src = state.mysteryPhotoUrl;
  $('#mysteryPhotoPanel').classList.remove('hidden');
  state.guideFilter = 'all'; $$('.guide-filter').forEach(b => b.classList.toggle('active', b.dataset.guide === 'all'));
  if ($('#cameraDialog').open) { stopCamera(); $('#cameraDialog').close(); }
  switchView('guideView'); renderGuide();
}
