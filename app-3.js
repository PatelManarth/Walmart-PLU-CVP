'use strict';
function addToQueue(id) {
  const existing = state.queue.find(q => q.id === id && !q.done);
  if (existing) { existing.addedAt = Date.now(); existing.bags = Number(existing.bags || 1) + 1; }
  else state.queue.unshift({ id, qty: '', bags: 1, done: false, addedAt: Date.now() });
  save(STORAGE.queue, state.queue); renderQueue();
}

function renderQueue() {
  const list = $('#queueList');
  list.innerHTML = state.queue.map((q, i) => {
    const item = byId(q.id); if (!item) return '';
    const unitLabel = item.unit === 'KG' ? 'kg' : 'pcs';
    const step = item.unit === 'KG' ? '0.01' : '1';
    const mode = item.unit === 'KG' ? 'decimal' : 'numeric';
    const bags = Number(q.bags || 1);
    return `<div class="queue-item ${q.done ? 'done' : ''}" data-qindex="${i}">
      <div class="queue-top">
        <div><div class="queue-title">${item.emoji} ${esc(item.name)}${bags > 1 ? ` <span class="alias-pill">${bags} bags</span>` : ''}</div><div class="alias-line">${item.unit === 'KG' ? 'Weight item • enter kg if useful' : 'Count item • enter pieces if useful'}</div></div>
        <button class="queue-code-btn" data-copy="${esc(item.plu)}" type="button">${esc(item.plu)}</button>
      </div>
      <div class="queue-controls">
        <div class="qty-wrap"><label>${unitLabel}</label><input class="qty-input" inputmode="${mode}" type="number" min="0" step="${step}" value="${esc(q.qty)}" placeholder="optional" aria-label="Quantity for ${esc(item.name)}" /></div>
        <button class="queue-action done-btn" type="button" aria-label="${q.done ? 'Mark not done' : 'Mark done'}">${q.done ? '↶' : '✓'}</button>
        <button class="queue-action remove-btn" type="button" aria-label="Remove">🗑</button>
      </div>
    </div>`;
  }).join('');
  $('#queueEmpty').classList.toggle('hidden', state.queue.length !== 0);
  $('#clearCompleted').classList.toggle('hidden', !state.queue.some(x => x.done));
  $('#startRapidMode').disabled = !state.queue.some(x => !x.done);
  $('#copyQueueSummary').disabled = !state.queue.length;

  $$('.queue-code-btn').forEach(btn => btn.addEventListener('click', () => copyText(btn.dataset.copy, `PLU ${btn.dataset.copy} copied`)));
  $$('.queue-item').forEach(row => {
    const idx = Number(row.dataset.qindex);
    $('.qty-input', row).addEventListener('input', e => { state.queue[idx].qty = e.target.value; save(STORAGE.queue, state.queue); });
    $('.done-btn', row).addEventListener('click', () => { state.queue[idx].done = !state.queue[idx].done; save(STORAGE.queue, state.queue); haptic(); renderQueue(); updateQueueCount(); });
    $('.remove-btn', row).addEventListener('click', () => { state.queue.splice(idx, 1); save(STORAGE.queue, state.queue); renderQueue(); updateQueueCount(); });
  });
  updateQueueCount();
}

function updateQueueCount() {
  const count = state.queue.filter(x => !x.done).length;
  $('#queueCount').textContent = count;
  $('#queueCount').classList.toggle('hidden', count === 0);
}

function copyQueueSummary() {
  const lines = state.queue.filter(q => !q.done).map(q => {
    const item = byId(q.id); if (!item) return '';
    const qty = q.qty ? ` • ${q.qty} ${item.unit === 'KG' ? 'kg' : 'pcs'}` : '';
    const bags = Number(q.bags || 1) > 1 ? ` • ${q.bags} bags` : '';
    return `${item.name} — PLU ${item.plu} — ${item.unit}${qty}${bags}`;
  }).filter(Boolean);
  copyText(lines.join('\n'), 'Queue copied');
}

function activeQueueEntries() { return state.queue.map((q, idx) => ({q, idx})).filter(x => !x.q.done && byId(x.q.id)); }

async function startRapidMode() {
  const entries = activeQueueEntries();
  if (!entries.length) { toast('Queue is empty'); return; }
  state.rapidIndex = 0;
  $('#rapidDialog').showModal();
  await requestWakeLock();
  renderRapid();
}

function renderRapid() {
  const entries = activeQueueEntries();
  if (!entries.length) {
    $('#rapidContent').innerHTML = `<div class="rapid-done"><div class="big-check">✓</div><h2>Queue complete</h2><p>Everything in the active queue is marked done.</p><button id="rapidCloseDone" class="primary-btn" type="button">Close</button></div>`;
    $('#rapidCloseDone').addEventListener('click', closeRapid);
    return;
  }
  state.rapidIndex = Math.min(state.rapidIndex, entries.length - 1);
  const entry = entries[state.rapidIndex];
  const item = byId(entry.q.id);
  const qty = entry.q.qty ? `${entry.q.qty} ${item.unit === 'KG' ? 'kg' : 'pcs'}` : 'Quantity not entered';
  $('#rapidContent').innerHTML = `
    <div class="rapid-topline"><span>${state.rapidIndex + 1} of ${entries.length} remaining</span><span>${DB.meta.version}</span></div>
    <h2 class="rapid-name">${item.emoji} ${esc(item.name)}</h2>
    <div class="rapid-plu-label">PLU</div>
    <div class="rapid-plu">${esc(item.plu)}</div>
    <div class="rapid-unit">${item.unit === 'KG' ? 'WEIGHT • KG' : 'COUNT • EA'}</div>
    <div class="rapid-qty">${esc(qty)}${Number(entry.q.bags || 1) > 1 ? ` • ${entry.q.bags} bags staged` : ''}</div>
    <div class="rapid-actions">
      <button id="rapidCopy" class="outline-btn" type="button">Copy PLU</button>
      <button id="rapidDoneNext" class="primary-btn" type="button">✓ Done + Next</button>
    </div>
    <div class="rapid-secondary">
      <button id="rapidPrev" type="button">← Prev</button>
      <button id="rapidSpeak" type="button">🔊 Read</button>
      <button id="rapidNext" type="button">Next →</button>
    </div>`;
  $('#rapidCopy').addEventListener('click', () => copyText(item.plu, `PLU ${item.plu} copied`));
  $('#rapidDoneNext').addEventListener('click', () => {
    state.queue[entry.idx].done = true; save(STORAGE.queue, state.queue); haptic(30); renderQueue(); state.rapidIndex = Math.min(state.rapidIndex, Math.max(0, activeQueueEntries().length - 1)); renderRapid();
  });
  $('#rapidPrev').addEventListener('click', () => { if (state.rapidIndex > 0) state.rapidIndex--; else state.rapidIndex = entries.length - 1; renderRapid(); });
  $('#rapidNext').addEventListener('click', () => { state.rapidIndex = (state.rapidIndex + 1) % entries.length; renderRapid(); });
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
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
}

function setSearch(text) {
  state.query = String(text || '').trim();
  $('#searchInput').value = state.query;
  $('#clearSearch').classList.toggle('hidden', !state.query);
  state.filter = 'All'; renderChips(); renderResults(); switchView('lookupView');
}

function parseVoiceCommand(text) {
  const n = normalize(text);
  if (!n) return;
  if (/^(queue|open queue|show queue)$/.test(n)) { switchView('queueView'); return; }
  if (/^(guide|visual guide|open guide)$/.test(n)) { switchView('guideView'); return; }
  const addMatch = n.match(/^(add|queue) (.+)$/);
  if (addMatch) {
    const matches = ITEMS.map(item => ({item, score: searchScore(item, addMatch[2])})).filter(x => x.score >= 650).sort((a,b) => b.score-a.score);
    if (matches.length === 1 || (matches[0] && (!matches[1] || matches[0].score > matches[1].score))) { addToQueue(matches[0].item.id); toast(`${matches[0].item.name} added`); return; }
  }
  setSearch(text);
}
