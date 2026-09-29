'use strict';
// Local reference photos in IndexedDB.
const PHOTO_DB = 'produce-cvp-local';
const PHOTO_STORE = 'referencePhotos';
function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(PHOTO_STORE)) req.result.createObjectStore(PHOTO_STORE); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
async function saveReferencePhoto(id, file) {
  const blob = await downscaleImage(file, 900, 0.82);
  const db = await openPhotoDb();
  await new Promise((resolve, reject) => { const tx = db.transaction(PHOTO_STORE,'readwrite'); tx.objectStore(PHOTO_STORE).put(blob,id); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); });
  db.close();
}
async function deleteReferencePhoto(id) {
  const db = await openPhotoDb();
  await new Promise((resolve, reject) => { const tx = db.transaction(PHOTO_STORE,'readwrite'); tx.objectStore(PHOTO_STORE).delete(id); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); db.close();
}
async function getReferenceBlob(id) {
  try { const db = await openPhotoDb(); const blob = await new Promise((resolve,reject)=>{ const req=db.transaction(PHOTO_STORE).objectStore(PHOTO_STORE).get(id); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); }); db.close(); return blob; } catch { return null; }
}
async function getReferencePhotoUrl(id) { const blob = await getReferenceBlob(id); return blob ? URL.createObjectURL(blob) : ''; }
async function hydrateReferenceThumbs(items) {
  for (const item of items.slice(0, 80)) {
    const nodes = $$(`[data-thumb-for="${item.id}"]`); if (!nodes.length) continue;
    const blob = await getReferenceBlob(item.id); if (!blob) continue;
    const url = URL.createObjectURL(blob);
    nodes.forEach(n => { n.innerHTML = `<img src="${url}" alt="Saved reference">`; });
  }
}
async function downscaleImage(file, maxDim, quality) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bmp.width*scale)); canvas.height = Math.max(1, Math.round(bmp.height*scale));
    canvas.getContext('2d').drawImage(bmp,0,0,canvas.width,canvas.height); bmp.close?.();
    return await new Promise(resolve => canvas.toBlob(b => resolve(b || file), 'image/jpeg', quality));
  } catch { return file; }
}

// Navigation, dialogs and controls.
$$('.nav-item').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
$$('.goto-lookup').forEach(btn => btn.addEventListener('click', () => switchView('lookupView')));
$('#openVisualGuide').addEventListener('click', () => switchView('guideView'));
['#openCamera','#openCameraHero','#openCameraGuide'].forEach(sel => $(sel).addEventListener('click', openCameraDialog));
$('#startCamera').addEventListener('click', startCamera);
$('#stopCamera').addEventListener('click', stopCamera);
$('#barcodePhoto').addEventListener('change', e => scanBarcodePhoto(e.target.files?.[0]));
$('#manualBarcodeGo').addEventListener('click', () => handleScannedCode($('#manualBarcode').value));
$('#manualBarcode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); handleScannedCode(e.currentTarget.value); } });
$('#mapSearch').addEventListener('input', e => renderBarcodeMapResults(e.target.value));
$('[data-close-barcode-map]').addEventListener('click', () => $('#barcodeMapDialog').close());
$('#barcodeMapDialog').addEventListener('click', e => { if (e.target === $('#barcodeMapDialog')) $('#barcodeMapDialog').close(); });
$('#exportBarcodeMappings').addEventListener('click', exportBarcodeMappings);
$('#importBarcodeMappings').addEventListener('change', e => { importBarcodeMappings(e.target.files?.[0]); e.target.value = ''; });
$('#clearBarcodeMappings').addEventListener('click', () => {
  if (!localPrimaryMappings().length) { toast('No saved mappings to clear'); return; }
  if (!confirm('Clear all locally saved barcode → PLU mappings on this device?')) return;
  state.barcodeMappings = {}; save(STORAGE.barcodeMappings, state.barcodeMappings); renderBarcodeManager(); toast('Barcode mappings cleared');
});
$('#mysteryCapture').addEventListener('change', e => setMysteryPhoto(e.target.files?.[0]));
$('#cameraMysteryCapture').addEventListener('change', e => setMysteryPhoto(e.target.files?.[0]));
$('#clearMysteryPhoto').addEventListener('click', () => { if (state.mysteryPhotoUrl) URL.revokeObjectURL(state.mysteryPhotoUrl); state.mysteryPhotoUrl=''; $('#mysteryPhotoPanel').classList.add('hidden'); });
$('#clearCompleted').addEventListener('click', () => { state.queue = state.queue.filter(x => !x.done); save(STORAGE.queue, state.queue); renderQueue(); });
$('#startRapidMode').addEventListener('click', startRapidMode);
$('#copyQueueSummary').addEventListener('click', copyQueueSummary);
$('[data-close-dialog]').addEventListener('click', () => $('#detailDialog').close());
$('[data-close-camera]').addEventListener('click', () => { stopCamera(); $('#cameraDialog').close(); });
$('[data-close-rapid]').addEventListener('click', closeRapid);
$('#openAbout').addEventListener('click', () => $('#aboutDialog').showModal());
$('[data-close-about]').addEventListener('click', () => $('#aboutDialog').close());
$('#detailDialog').addEventListener('click', e => { if (e.target === $('#detailDialog')) $('#detailDialog').close(); });
$('#cameraDialog').addEventListener('click', e => { if (e.target === $('#cameraDialog')) { stopCamera(); $('#cameraDialog').close(); } });
$('#rapidDialog').addEventListener('click', e => { if (e.target === $('#rapidDialog')) closeRapid(); });
$('#aboutDialog').addEventListener('click', e => { if (e.target === $('#aboutDialog')) $('#aboutDialog').close(); });
$('#cameraDialog').addEventListener('close', stopCamera);
$('#rapidDialog').addEventListener('close', releaseWakeLock);

$$('.guide-filter').forEach(btn => btn.addEventListener('click', () => {
  state.guideFilter = btn.dataset.guide;
  $$('.guide-filter').forEach(b => b.classList.toggle('active', b === btn)); renderGuide();
}));

document.addEventListener('keydown', e => {
  if ($('#rapidDialog').open) {
    if (e.key === 'ArrowRight') $('#rapidNext')?.click();
    if (e.key === 'ArrowLeft') $('#rapidPrev')?.click();
    if (e.key === 'Enter') $('#rapidDoneNext')?.click();
  }
});

$('#dataVersion').innerHTML = `<strong>${esc(DB.meta.title)}</strong><br>${esc(DB.meta.version)} • ${ITEMS.length} entries`;

renderChips(); renderResults(); renderQueue(); renderGuide(); renderBarcodeManager(); updateQueueCount();
if (location.hash === '#queue') switchView('queueView');
else if (location.hash === '#guide') switchView('guideView');

// Load the optional local Code 128 PLU display after the core app is ready.
const pluBarcodeScript = document.createElement('script');
pluBarcodeScript.src = './app-6.js';
pluBarcodeScript.defer = true;
document.head.appendChild(pluBarcodeScript);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}));
}
