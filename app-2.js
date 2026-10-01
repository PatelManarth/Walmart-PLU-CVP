'use strict';

async function openDetail(item) {
  if (!item) return;
  state.currentItemId = item.id;
  pushRecent(item.id);
  bumpUsage(item.id);

  const fav = state.favorites.includes(item.id);
  const dupes = duplicatesFor(item);
  const localAliases = customAliases(item);
  const displayAliases = [...new Set([...(item.aliases || []), ...localAliases])];
  const languageGroups = multilingualGroups(item);
  const languagePanel = Object.keys(languageGroups).length
    ? `<div class="language-box"><strong>Other language names</strong><div class="language-grid">${Object.entries(languageGroups).map(([lang,names]) => `<div><span>${esc(I18N_LANG_LABELS[lang] || lang)}</span><strong>${esc((names || []).slice(0,3).join(' • '))}</strong></div>`).join('')}</div></div>`
    : '';
  const photoUrl = await getReferencePhotoUrl(item.id);
  const openBag = typeof openBagForItem === 'function' ? openBagForItem(item.id) : null;
  const productBags = typeof bagsForItem === 'function' ? bagsForItem(item.id) : [];
  const readyBags = productBags.filter(b => b.status === 'ready');
  const labelingBags = productBags.filter(b => b.status === 'labeling');
  const doneBags = productBags.filter(b => b.status === 'done');

  const bagPanel = openBag
    ? `<div class="current-bag-box">
        <div>
          <span class="kicker">Put this product here</span>
          <div class="current-bag-id">${esc(openBag.bagId)}</div>
          <strong>OPEN BAG</strong>
          <p>Keep adding ${esc(item.name)} to ${esc(openBag.bagId)} until you decide that physical bag is full.</p>
        </div>
        <div class="current-bag-actions">
          <button id="confirmOpenBag" class="primary-btn" type="button">✓ Put in ${esc(openBag.bagId)}</button>
          <button id="bagFullNew" class="outline-btn" type="button">Bag full → new bag</button>
          <button id="bagReady" class="outline-btn" type="button">Ready for label</button>
        </div>
      </div>`
    : `<div class="current-bag-box no-open">
        <div>
          <span class="kicker">No open bag yet</span>
          <h3>Start a physical bag for this product</h3>
          <p>A new bag ID will be created. Later, if it fills, close it and open another bag for the same product.</p>
        </div>
        <button id="startOpenBag" class="primary-btn" type="button">+ Start open bag</button>
      </div>`;

  const historyBits = [
    readyBags.length ? `${readyBags.length} ready` : '',
    labelingBags.length ? `${labelingBags.length} labeling` : '',
    doneBags.length ? `${doneBags.length} done` : ''
  ].filter(Boolean).join(' • ');

  $('#detailContent').innerHTML = `
    <div class="detail-hero">
      <div class="detail-visual">${photoUrl ? `<img src="${photoUrl}" alt="Saved reference for ${esc(item.name)}">` : item.emoji}</div>
      <h2>${esc(item.name)}</h2>
      <p class="detail-alias">${esc(displayAliases.join(' • ') || 'Produce item')}</p>
    </div>
    <div class="detail-body">
      <div class="big-code-row">
        <div><div class="big-code-label">PLU code</div><div class="big-code">${esc(item.plu)}</div></div>
        <div class="unit-big">${item.unit === 'KG' ? 'WEIGHT • KG' : 'COUNT • EA'}</div>
      </div>

      ${bagPanel}
      ${historyBits ? `<div class="bag-history-line"><strong>Other bags for this product:</strong> ${esc(historyBits)}</div>` : ''}

      ${languagePanel}
      ${item.visual ? `<div class="visual-note"><strong>Visual clue:</strong> ${esc(item.visual)}</div>` : ''}
      ${dupes.length ? `<div class="duplicate-warning"><strong>Duplicate PLU in the reference:</strong> ${dupes.map(x => esc(x.name)).join(' • ')} also use ${esc(item.plu)}. Confirm the exact product before using the code.</div>` : ''}

      <div class="barcode-box"><strong>Barcode → PLU mappings</strong><br><small>Scan this exact barcode later and the app will open this product/PLU immediately.</small>
        <div class="alias-pills">${mappingsForItem(item).length ? mappingsForItem(item).map(m => `<button class="alias-pill barcode-pill ${m.source === 'built-in' ? 'locked' : ''}" data-barcode-remove="${esc(m.barcode)}" data-source="${m.source}" type="button">${esc(m.barcode)}${m.source === 'built-in' ? ' ✓' : ' ×'}</button>`).join('') : '<span class="alias-pill">No barcodes mapped yet</span>'}</div>
        <div class="reference-actions"><button id="addBarcodeForItem" class="mini-btn" type="button">▦ Add barcode</button></div>
      </div>

      <div class="custom-alias-box"><strong>My local names / nicknames</strong><br><small>Teach the app terms you actually hear at work.</small>
        <div class="alias-pills">${localAliases.length ? localAliases.map(a => `<span class="alias-pill">${esc(a)}</span>`).join('') : '<span class="alias-pill">None yet</span>'}</div>
        <div class="reference-actions"><button id="addAlias" class="mini-btn" type="button">+ Add nickname</button>${localAliases.length ? '<button id="clearAliases" class="mini-btn" type="button">Clear my nicknames</button>' : ''}</div>
      </div>

      <div class="reference-box"><strong>My reference photo</strong><br><small>After you confirm a difficult item once, save a photo. It stays on this device/browser only.</small>
        ${photoUrl ? `<img class="reference-preview" src="${photoUrl}" alt="Saved reference photo for ${esc(item.name)}">` : ''}
        <div class="reference-actions">
          <label class="mini-btn file-btn">${photoUrl ? 'Replace photo' : '📷 Save photo'}<input id="referenceCapture" type="file" accept="image/*" capture="environment" hidden></label>
          ${photoUrl ? '<button id="deleteReference" class="mini-btn" type="button">Remove photo</button>' : ''}
        </div>
      </div>

      <div class="detail-actions">
        <button id="copyCode" class="outline-btn" type="button">Copy PLU</button>
        <button id="markThrow" class="outline-btn danger-text" type="button">🗑 Throw</button>
        <button id="speakCode" class="outline-btn" type="button">🔊 Read code</button>
        <button id="toggleFavorite" class="outline-btn" type="button">${fav ? '★ Saved' : '☆ Save'}</button>
      </div>
    </div>`;

  $('#copyCode').addEventListener('click', () => copyText(item.plu, `PLU ${item.plu} copied`));

  $('#confirmOpenBag')?.addEventListener('click', () => {
    haptic();
    toast(`${openBag.bagId} OPEN — put ${item.name} here`);
  });

  $('#startOpenBag')?.addEventListener('click', () => {
    const bag = createOpenBag(item.id);
    haptic();
    toast(`${bag.bagId} created for ${item.name}`);
    openDetail(item);
  });

  $('#bagFullNew')?.addEventListener('click', () => {
    const next = markBagFullAndOpenNext(openBag.bagId);
    if (next) openDetail(item);
  });

  $('#bagReady')?.addEventListener('click', () => {
    const bag = markBagReady(openBag.bagId);
    if (bag) {
      haptic();
      toast(`${bag.bagId} ready for labeling`);
      openDetail(item);
    }
  });

  $('#markThrow').addEventListener('click', () => {
    markThrow(item.id);
    haptic();
    if ($('#detailDialog').open) $('#detailDialog').close();
  });

  $('#speakCode').addEventListener('click', () => speakCode(item));
  $('#toggleFavorite').addEventListener('click', () => { toggleFavorite(item.id); openDetail(item); });
  $('#addAlias').addEventListener('click', () => addCustomAlias(item));

  $('#addBarcodeForItem').addEventListener('click', () => {
    const raw = prompt(`Enter or paste the barcode for ${item.name}:`, '');
    if (!canonicalBarcode(raw)) return;
    if (saveBarcodeMapping(raw, item)) { toast(`Barcode mapped to PLU ${item.plu}`); openDetail(item); }
  });

  $$('[data-barcode-remove]', $('#detailContent')).forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.source === 'built-in') { toast('Built-in verified mappings are read-only'); return; }
    removeBarcodeMapping(btn.dataset.barcode);
    toast('Barcode mapping removed');
    openDetail(item);
  }));

  $('#clearAliases')?.addEventListener('click', () => {
    delete state.aliases[item.id];
    save(STORAGE.aliases, state.aliases);
    toast('Custom nicknames cleared');
    openDetail(item);
    renderResults();
  });

  $('#referenceCapture').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    await saveReferencePhoto(item.id, file);
    toast('Reference photo saved on this device');
    openDetail(item);
    renderGuide();
    renderResults();
  });

  $('#deleteReference')?.addEventListener('click', async () => {
    await deleteReferencePhoto(item.id);
    toast('Reference photo removed');
    openDetail(item);
    renderGuide();
    renderResults();
  });

  if (!$('#detailDialog').open) $('#detailDialog').showModal();
}


function openPackagedDetail(item, trackedUnit = null) {
  if (!item || item.type !== 'packaged') return;
  state.currentItemId = item.id;
  pushRecent(item.id);

  const existing = bagsForItem(item.id);
  const ready = existing.filter(x => x.status === 'ready').length;
  const labeling = existing.filter(x => x.status === 'labeling').length;
  const done = existing.filter(x => x.status === 'done').length;

  $('#detailContent').innerHTML = `
    <div class="detail-hero packaged-detail-hero">
      <div class="detail-visual">📦</div>
      <h2>${esc(item.name)}</h2>
      <p class="detail-alias">${esc(item.category || 'Packaged produce')}</p>
    </div>
    <div class="detail-body">
      <div class="big-code-row package-code-row">
        <div>
          <div class="big-code-label">Package barcode / UPC</div>
          <div class="package-code">${esc(item.barcode)}</div>
        </div>
        <div class="unit-big">PACKAGED</div>
      </div>

      ${trackedUnit ? `<div class="current-bag-box">
        <div>
          <span class="kicker">Scanned package added</span>
          <div class="current-bag-id">${esc(trackedUnit.bagId)}</div>
          <strong>READY FOR A LABEL ROUND</strong>
          <p>This represents one physical packaged unit. Scan another identical package to add another unit.</p>
        </div>
      </div>` : ''}

      <div class="package-note">
        <strong>Exact barcode match only.</strong>
        <p>The packaged catalog uses the UPC/GTIN printed on the package. Confirm the product name and size on the physical package before continuing.</p>
      </div>

      <div class="bag-history-line"><strong>Tracked this session:</strong> ${ready} ready • ${labeling} labeling • ${done} done</div>

      <div class="detail-actions">
        <button id="addPackagedUnit" class="primary-btn" type="button">+ Add 1 package</button>
        <button id="copyPackageCode" class="outline-btn" type="button">Copy barcode</button>
        <button id="markPackagedThrow" class="outline-btn danger-text" type="button">🗑 Throw</button>
        <button id="gotoBagsFromPackage" class="outline-btn" type="button">View bags</button>
      </div>
    </div>`;

  $('#addPackagedUnit').addEventListener('click', () => {
    const unit = addPackagedUnit(item.id);
    haptic();
    toast(`${unit.bagId} READY — ${item.name}`);
    openPackagedDetail(item, unit);
  });
  $('#copyPackageCode').addEventListener('click', () => copyText(item.barcode, `Barcode ${item.barcode} copied`));
  $('#markPackagedThrow').addEventListener('click', () => {
    markThrow(item.id);
    haptic();
    if ($('#detailDialog').open) $('#detailDialog').close();
  });
  $('#gotoBagsFromPackage').addEventListener('click', () => {
    if ($('#detailDialog').open) $('#detailDialog').close();
    switchView('queueView');
  });

  if (!$('#detailDialog').open) $('#detailDialog').showModal();
}

function addCustomAlias(item) {
  const value = prompt(`Add a local nickname for ${item.name}:`, '');
  const cleaned = String(value || '').trim();
  if (!cleaned) return;
  const existing = customAliases(item);
  if (existing.some(a => normalize(a) === normalize(cleaned)) || item.aliases.some(a => normalize(a) === normalize(cleaned))) {
    toast('That nickname already exists');
    return;
  }
  state.aliases[item.id] = [...existing, cleaned].slice(0, 12);
  save(STORAGE.aliases, state.aliases);
  toast(`“${cleaned}” will now find ${item.name}`);
  openDetail(item);
  renderResults();
}

function bumpUsage(id) {
  state.usage[id] = Number(state.usage[id] || 0) + 1;
  save(STORAGE.usage, state.usage);
  renderFrequentStrip();
}

function speakCode(item) {
  if (!('speechSynthesis' in window)) { toast('Read-aloud is unavailable'); return; }
  const packaged = item?.type === 'packaged';
  const code = packaged ? String(item.barcode || '') : String(item.plu || '');
  const digits = code.split('').join(' ');
  const unit = packaged ? 'packaged item' : (item.unit === 'KG' ? 'kilograms' : 'each');
  const resumeVoice = typeof voiceWanted !== 'undefined' && voiceWanted;
  if (resumeVoice && typeof pauseVoiceForCamera === 'function') pauseVoiceForCamera();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(packaged
    ? `${item.name}. Barcode ${digits}. ${unit}.`
    : `${item.name}. P L U ${digits}. ${unit}.`);
  u.lang = 'en-CA';
  u.rate = 0.88;
  u.onend = () => { if (resumeVoice && typeof resumeVoiceAfterCamera === 'function') resumeVoiceAfterCamera(); };
  u.onerror = () => { if (resumeVoice && typeof resumeVoiceAfterCamera === 'function') resumeVoiceAfterCamera(); };
  speechSynthesis.speak(u);
}

function copyText(text, message) {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => {
    haptic(); toast(message);
  }).catch(() => fallbackCopy(text, message));
  else fallbackCopy(text, message);
}

function fallbackCopy(text, message) {
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  try { document.execCommand('copy'); haptic(); toast(message); }
  catch { toast(`PLU: ${text}`); }
  el.remove();
}

function pushRecent(id) {
  state.recents = [id, ...state.recents.filter(x => x !== id)].slice(0, 20);
  save(STORAGE.recents, state.recents);
}

function toggleFavorite(id) {
  state.favorites = state.favorites.includes(id)
    ? state.favorites.filter(x => x !== id)
    : [id, ...state.favorites];
  save(STORAGE.favorites, state.favorites);
  toast(state.favorites.includes(id) ? 'Saved' : 'Removed from saved');
}
