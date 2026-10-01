'use strict';

// Physical-bag workflow.
// A product can have many physical bags, but only one OPEN bag at a time.
// Bags move OPEN -> READY -> LABELING -> DONE. New product found after a bag
// is READY/LABELING/DONE gets a new OPEN bag automatically.
const BAG_COUNTER_KEY = 'produce-cvp.bagCounter.v1';
const LABEL_ROUND_KEY = 'produce-cvp.labelRound.v1';
const BAG_STATUSES = ['open','ready','labeling','done','throw'];

function bagNumberFromId(id) {
  const m = String(id || '').match(/^A(\d+)$/i);
  return m ? Number(m[1]) : 0;
}

function formatBagId(n) { return `A${String(n).padStart(2,'0')}`; }

function nextBagId() {
  const maxExisting = Math.max(0, ...state.queue.map(q => bagNumberFromId(q.bagId)));
  let n = Math.max(Number(load(BAG_COUNTER_KEY, 0) || 0), maxExisting) + 1;
  save(BAG_COUNTER_KEY, n);
  return formatBagId(n);
}

function migrateBagQueue() {
  const raw = Array.isArray(state.queue) ? state.queue : [];
  if (raw.every(q => q?.bagId && BAG_STATUSES.includes(q.status))) return;

  let counter = Number(load(BAG_COUNTER_KEY, 0) || 0);
  const migrated = [];
  for (const q of raw) {
    if (!q?.id || !byId(q.id)) continue;
    const copies = Math.max(1, Math.min(20, Number(q.bags || 1)));
    for (let i = 0; i < copies; i++) {
      counter++;
      migrated.push({
        bagId: formatBagId(counter),
        id: q.id,
        status: q.done ? 'done' : (i === copies - 1 ? 'open' : 'ready'),
        createdAt: Number(q.addedAt || Date.now()),
        updatedAt: Date.now(),
        round: null
      });
    }
  }
  state.queue = migrated;
  save(BAG_COUNTER_KEY, counter);
  save(STORAGE.queue, state.queue);
}
migrateBagQueue();

function bagsForItem(id) {
  return state.queue.filter(q => q.id === id && q.status !== 'throw');
}

function openBagForItem(id) {
  return state.queue.find(q => q.id === id && q.status === 'open') || null;
}

function bagById(bagId) {
  return state.queue.find(q => q.bagId === bagId) || null;
}

function bagStatusLabel(status) {
  return ({open:'OPEN', ready:'READY', labeling:'LABELING', done:'DONE', throw:'THROW'})[status] || String(status || '').toUpperCase();
}

function createOpenBag(id) {
  const item = byId(id);
  if (!item) return null;
  const existing = openBagForItem(id);
  if (existing) return existing;
  const bag = {
    bagId: nextBagId(),
    id,
    status: 'open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    round: null
  };
  state.queue.unshift(bag);
  save(STORAGE.queue, state.queue);
  renderQueue();
  updateQueueCount();
  return bag;
}

// Kept under the old function name so existing detail/voice bindings continue to work.
function addToQueue(id) {
  return createOpenBag(id);
}

function markBagReady(bagId) {
  const bag = bagById(bagId);
  if (!bag || bag.status !== 'open') return null;
  bag.status = 'ready';
  bag.updatedAt = Date.now();
  save(STORAGE.queue, state.queue);
  renderQueue();
  updateQueueCount();
  return bag;
}

function markBagFullAndOpenNext(bagId) {
  const bag = bagById(bagId);
  if (!bag || bag.status !== 'open') return null;
  const item = byId(bag.id);
  bag.status = 'ready';
  bag.updatedAt = Date.now();
  const next = {
    bagId: nextBagId(),
    id: bag.id,
    status: 'open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    round: null
  };
  state.queue.unshift(next);
  save(STORAGE.queue, state.queue);
  renderQueue();
  updateQueueCount();
  haptic(30);
  toast(`${bag.bagId} ready • use ${next.bagId} for more ${item?.name || 'items'}`);
  return next;
}

function reopenBag(bagId) {
  const bag = bagById(bagId);
  if (!bag || bag.status !== 'ready') return;
  const existing = openBagForItem(bag.id);
  if (existing && existing.bagId !== bag.bagId) {
    toast(`${existing.bagId} is already the open bag for this product`);
    return;
  }
  bag.status = 'open';
  bag.round = null;
  bag.updatedAt = Date.now();
  save(STORAGE.queue, state.queue);
  renderQueue();
  updateQueueCount();
}

function markThrow(id) {
  const item = byId(id);
  if (!item) return null;
  const record = {
    bagId: `T${String(state.queue.filter(q => q.status === 'throw').length + 1).padStart(2,'0')}`,
    id,
    status: 'throw',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    round: null
  };
  state.queue.unshift(record);
  save(STORAGE.queue, state.queue);
  renderQueue();
  updateQueueCount();
  toast(`${item.name} marked THROW`);
  return record;
}

function queueStatusCounts() {
  const counts = {open:0, ready:0, labeling:0, done:0, throw:0};
  state.queue.forEach(q => { if (counts[q.status] !== undefined) counts[q.status]++; });
  return counts;
}

function bagCard(q) {
  const item = byId(q.id);
  if (!item) return '';
  let actions = '';
  if (q.status === 'open') {
    actions = `
      <button class="mini-btn bag-full-btn" type="button">Bag full → new</button>
      <button class="mini-btn bag-ready-btn" type="button">Ready</button>`;
  } else if (q.status === 'ready') {
    actions = `<button class="mini-btn bag-reopen-btn" type="button">Reopen</button>`;
  } else if (q.status === 'labeling') {
    actions = `<button class="mini-btn bag-done-btn" type="button">✓ Label done</button>`;
  } else if (q.status === 'done') {
    actions = `<button class="mini-btn bag-undo-btn" type="button">Undo to ready</button>`;
  }

  return `<div class="queue-item bag-card status-${q.status}" data-bag-id="${esc(q.bagId)}">
    <div class="bag-id-block">
      <span class="bag-id">${esc(q.bagId)}</span>
      <span class="bag-status status-${q.status}">${bagStatusLabel(q.status)}</span>
    </div>
    <div class="bag-main">
      <div class="queue-title">${item.emoji} ${esc(item.name)}</div>
      <div class="alias-line">PLU ${esc(item.plu)} • ${item.unit === 'KG' ? 'WEIGHT • KG' : 'COUNT • EA'}${q.round ? ` • Round ${q.round}` : ''}</div>
    </div>
    <button class="queue-code-btn" data-copy="${esc(item.plu)}" type="button">${esc(item.plu)}</button>
    <div class="bag-actions">${actions}<button class="mini-btn bag-remove-btn" type="button">Remove</button></div>
  </div>`;
}

function renderQueue() {
  const list = $('#queueList');
  if (!list) return;
  const counts = queueStatusCounts();
  const order = ['labeling','open','ready','done','throw'];
  const labels = {
    labeling:'🏷 Current label round',
    open:'🟢 Open bags',
    ready:'🟡 Ready bags',
    done:'✅ Finished bags',
    throw:'🗑 Throws'
  };

  const sections = order.map(status => {
    const rows = state.queue.filter(q => q.status === status);
    if (!rows.length) return '';
    return `<section class="bag-section bag-section-${status}">
      <div class="bag-section-head"><strong>${labels[status]}</strong><span>${rows.length}</span></div>
      <div class="bag-list">${rows.map(bagCard).join('')}</div>
    </section>`;
  }).join('');

  list.innerHTML = sections;

  const summary = $('#bagSummary');
  if (summary) {
    summary.innerHTML = `
      <div><strong>${counts.open}</strong><span>Open</span></div>
      <div><strong>${counts.ready}</strong><span>Ready</span></div>
      <div><strong>${counts.labeling}</strong><span>Labeling</span></div>
      <div><strong>${counts.done}</strong><span>Done</span></div>`;
  }

  $('#queueEmpty')?.classList.toggle('hidden', state.queue.length !== 0);
  $('#clearCompleted')?.classList.toggle('hidden', !state.queue.some(x => ['done','throw'].includes(x.status)));
  if ($('#startRapidMode')) $('#startRapidMode').disabled = !state.queue.some(x => x.status === 'ready' || x.status === 'labeling');
  if ($('#closeOpenAndLabel')) $('#closeOpenAndLabel').disabled = !state.queue.some(x => ['open','ready','labeling'].includes(x.status));
  if ($('#copyQueueSummary')) $('#copyQueueSummary').disabled = !state.queue.length;

  $$('.queue-code-btn', list).forEach(btn => btn.addEventListener('click', () => copyText(btn.dataset.copy, `PLU ${btn.dataset.copy} copied`)));
  $$('.bag-card', list).forEach(row => {
    const id = row.dataset.bagId;
    $('.bag-full-btn', row)?.addEventListener('click', () => markBagFullAndOpenNext(id));
    $('.bag-ready-btn', row)?.addEventListener('click', () => {
      const b = markBagReady(id); if (b) toast(`${b.bagId} ready for labeling`);
    });
    $('.bag-reopen-btn', row)?.addEventListener('click', () => reopenBag(id));
    $('.bag-done-btn', row)?.addEventListener('click', () => markBagDone(id));
    $('.bag-undo-btn', row)?.addEventListener('click', () => {
      const b = bagById(id); if (!b) return; b.status = 'ready'; b.round = null; b.updatedAt = Date.now();
      save(STORAGE.queue, state.queue); renderQueue(); updateQueueCount();
    });
    $('.bag-remove-btn', row)?.addEventListener('click', () => {
      const idx = state.queue.findIndex(q => q.bagId === id);
      if (idx < 0) return;
      state.queue.splice(idx, 1); save(STORAGE.queue, state.queue); renderQueue(); updateQueueCount();
    });
  });
  updateQueueCount();
}

function updateQueueCount() {
  const count = state.queue.filter(x => ['open','ready','labeling'].includes(x.status)).length;
  if (!$('#queueCount')) return;
  $('#queueCount').textContent = count;
  $('#queueCount').classList.toggle('hidden', count === 0);
}

function copyQueueSummary() {
  const lines = state.queue.map(q => {
    const item = byId(q.id); if (!item) return '';
    return `${q.bagId} — ${bagStatusLabel(q.status)} — ${item.name} — PLU ${item.plu} — ${item.unit}`;
  }).filter(Boolean);
  copyText(lines.join('\n'), 'Bag list copied');
}

function currentLabelingEntries() {
  return state.queue.map((q, idx) => ({q, idx})).filter(x => x.q.status === 'labeling' && byId(x.q.id));
}

function nextLabelRoundNumber() {
  const current = Number(load(LABEL_ROUND_KEY, 0) || 0) + 1;
  save(LABEL_ROUND_KEY, current);
  return current;
}

async function startLabelRound(closeOpen = false) {
  const existing = currentLabelingEntries();
  let round = existing[0]?.q.round || null;

  if (closeOpen) {
    state.queue.forEach(q => {
      if (q.status === 'open') {
        q.status = 'ready';
        q.updatedAt = Date.now();
      }
    });
  }

  const ready = state.queue.filter(q => q.status === 'ready');
  if (!existing.length && !ready.length) {
    toast(closeOpen ? 'No open or ready bags to label' : 'No ready bags yet');
    renderQueue();
    return;
  }

  if (!round) round = nextLabelRoundNumber();
  ready.forEach(q => {
    q.status = 'labeling';
    q.round = round;
    q.updatedAt = Date.now();
  });
  save(STORAGE.queue, state.queue);
  renderQueue();
  updateQueueCount();

  state.rapidIndex = 0;
  if (!$('#rapidDialog').open) $('#rapidDialog').showModal();
  await requestWakeLock();
  renderRapid();
}

function startRapidMode() { return startLabelRound(false); }
function closeOpenAndStartLabelRound() { return startLabelRound(true); }

function markBagDone(bagId) {
  const bag = bagById(bagId);
  if (!bag || bag.status !== 'labeling') return;
  bag.status = 'done';
  bag.updatedAt = Date.now();
  save(STORAGE.queue, state.queue);
  haptic(30);
  renderQueue();
  updateQueueCount();
}

function renderRapid() {
  const entries = currentLabelingEntries();
  if (!entries.length) {
    const open = queueStatusCounts().open;
    $('#rapidContent').innerHTML = `<div class="rapid-done"><div class="big-check">✓</div><h2>Label round complete</h2><p>Every bag in this round is marked done.${open ? ` ${open} new/open bag${open === 1 ? '' : 's'} remain for later.` : ''}</p><button id="rapidCloseDone" class="primary-btn" type="button">Back to bags</button></div>`;
    $('#rapidCloseDone').addEventListener('click', () => { closeRapid(); switchView('queueView'); });
    return;
  }

  state.rapidIndex = Math.min(state.rapidIndex, entries.length - 1);
  const entry = entries[state.rapidIndex];
  const item = byId(entry.q.id);
  $('#rapidContent').innerHTML = `
    <div class="rapid-topline"><span>${state.rapidIndex + 1} of ${entries.length} remaining</span><span>Round ${entry.q.round || '—'}</span></div>
    <div class="rapid-bag-id">${esc(entry.q.bagId)}</div>
    <h2 class="rapid-name">${item.emoji} ${esc(item.name)}</h2>
    <div class="rapid-plu-label">PLU</div>
    <div class="rapid-plu">${esc(item.plu)}</div>
    <div class="rapid-unit">${item.unit === 'KG' ? 'WEIGHT • KG' : 'COUNT • EA'}</div>
    <div class="rapid-qty">Weigh/count as needed → print label → attach label → tie bag.</div>
    <div class="rapid-actions">
      <button id="rapidCopy" class="outline-btn" type="button">Copy PLU</button>
      <button id="rapidDoneNext" class="primary-btn" type="button">✓ Label done</button>
    </div>
    <div class="rapid-secondary">
      <button id="rapidPrev" type="button">← Prev</button>
      <button id="rapidSpeak" type="button">🔊 Read</button>
      <button id="rapidNext" type="button">Next →</button>
    </div>`;

  $('#rapidCopy').addEventListener('click', () => copyText(item.plu, `PLU ${item.plu} copied`));
  $('#rapidDoneNext').addEventListener('click', () => {
    markBagDone(entry.q.bagId);
    state.rapidIndex = Math.min(state.rapidIndex, Math.max(0, currentLabelingEntries().length - 1));
    renderRapid();
  });
  $('#rapidPrev').addEventListener('click', () => {
    if (state.rapidIndex > 0) state.rapidIndex--; else state.rapidIndex = entries.length - 1;
    renderRapid();
  });
  $('#rapidNext').addEventListener('click', () => {
    state.rapidIndex = (state.rapidIndex + 1) % entries.length;
    renderRapid();
  });
  $('#rapidSpeak').addEventListener('click', () => speakCode(item));
}

async function requestWakeLock() {
  try { if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
async function releaseWakeLock() { try { await state.wakeLock?.release(); } catch {} state.wakeLock = null; }
function closeRapid() { releaseWakeLock(); if ($('#rapidDialog').open) $('#rapidDialog').close(); }

function guideGroup(item) {
  const g = groupFor(item).toLowerCase();
  return ['roots','gourds','greens','fruit'].includes(g) ? g : 'other';
}

async function renderGuide() {
  const guideItems = ITEMS.filter(x => x.visual).filter(x => state.guideFilter === 'all' || guideGroup(x) === state.guideFilter);
  $('#guideCards').innerHTML = guideItems.map(item => `<button class="guide-card" data-id="${item.id}" type="button">
    <span class="emoji-box" data-thumb-for="${item.id}">${item.emoji}</span>
    <span><strong class="product-name">${esc(item.name)}</strong><p>${esc(item.visual)}</p></span>
    <span class="code-stack"><span class="plu">${esc(item.plu)}</span><span class="unit">${item.unit}</span></span>
  </button>`).join('');
  $$('.guide-card').forEach(card => card.addEventListener('click', () => openDetail(byId(card.dataset.id))));
  hydrateReferenceThumbs(guideItems);
}

function switchView(id) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === id));
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === id));
  if (id === 'queueView') renderQueue();
  if (id === 'guideView') renderGuide();
  window.scrollTo({top:0, behavior:'auto'});
}

let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setSearch(text) {
  state.query = String(text || '').trim();
  $('#searchInput').value = state.query;
  $('#clearSearch').classList.toggle('hidden', !state.query);
  state.filter = 'All'; renderChips(); renderResults(); switchView('lookupView');
}

function closeDetailForVoiceNavigation() {
  const dialog = $('#detailDialog');
  if (dialog?.open) dialog.close();
}

function rankedVoiceMatches(query) {
  return ITEMS
    .map(item => ({ item, score: searchScore(item, query) }))
    .filter(x => x.score >= 0)
    .sort((a,b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
}

function currentVoiceItem() {
  return byId(state.currentItemId);
}

function parseVoiceCommand(text) {
  const n = normalize(text);
  if (!n) return;

  if (/^(stop listening|stop microphone|mic off|microphone off)$/.test(n)) {
    if (typeof turnVoiceOff === 'function') turnVoiceOff();
    return;
  }

  if (/^(bags|open bags|show bags|queue|open queue|show queue)$/.test(n)) {
    closeDetailForVoiceNavigation();
    switchView('queueView');
    return;
  }

  if (/^(guide|visual guide|open guide)$/.test(n)) {
    closeDetailForVoiceNavigation();
    switchView('guideView');
    return;
  }

  if (/^(label ready|start label round|start labeling)$/.test(n)) {
    closeDetailForVoiceNavigation();
    startLabelRound(false);
    return;
  }

  if (/^(label all|close open and label|close all and label)$/.test(n)) {
    closeDetailForVoiceNavigation();
    startLabelRound(true);
    return;
  }

  if (/^(label done|done next|done)$/.test(n) && $('#rapidDialog')?.open) {
    $('#rapidDoneNext')?.click();
    return;
  }

  if (/^(bag full|full bag|new bag|start new bag)$/.test(n)) {
    const item = currentVoiceItem();
    const open = item && openBagForItem(item.id);
    if (!item || !open) { toast('No open bag selected'); return; }
    markBagFullAndOpenNext(open.bagId);
    openDetail(item);
    return;
  }

  if (/^(ready|bag ready|ready bag)$/.test(n)) {
    const item = currentVoiceItem();
    const open = item && openBagForItem(item.id);
    if (!item || !open) { toast('No open bag selected'); return; }
    markBagReady(open.bagId);
    toast(`${open.bagId} ready for labeling`);
    openDetail(item);
    return;
  }

  if (/^(throw it|throw this|garbage|mark throw)$/.test(n)) {
    const item = currentVoiceItem();
    if (!item) { toast('Open a produce item first'); return; }
    markThrow(item.id);
    closeDetailForVoiceNavigation();
    return;
  }

  if (/^(add it|add this|put it|put this|queue it|queue this)$/.test(n)) {
    const item = currentVoiceItem();
    if (!item) { toast('Open a produce item first'); return; }
    const bag = createOpenBag(item.id);
    closeDetailForVoiceNavigation();
    haptic();
    toast(`${bag.bagId} OPEN — put ${item.name} here`);
    return;
  }

  const addMatch = n.match(/^(add|put|queue) (.+)$/);
  if (addMatch) {
    const matches = rankedVoiceMatches(addMatch[2]).filter(x => x.score >= 560);
    if (matches.length === 1 || (matches[0] && (!matches[1] || matches[0].score > matches[1].score + 30))) {
      const bag = createOpenBag(matches[0].item.id);
      state.currentItemId = matches[0].item.id;
      closeDetailForVoiceNavigation();
      toast(`${bag.bagId} OPEN — put ${matches[0].item.name} here`);
      return;
    }
  }

  // A new spoken produce name replaces whatever item is currently open.
  // Unique matches can open directly; ambiguous families (apple/tomato/carrot/etc.)
  // stay as a choice list so the app never guesses the exact PLU.
  const matches = rankedVoiceMatches(text);
  closeDetailForVoiceNavigation();
  setSearch(text);
  if (
    (matches.length === 1 && matches[0].score >= 560) ||
    (matches[0] && matches[0].score >= 850 && (!matches[1] || matches[0].score >= matches[1].score + 60))
  ) {
    openDetail(matches[0].item);
  }
}
