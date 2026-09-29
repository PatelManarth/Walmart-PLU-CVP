'use strict';

const DB = window.PRODUCE_DATA;
const ITEMS = DB.items;
const BUILTIN_BARCODES = window.BARCODE_DATA?.mappings || [];
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STORAGE = {
  queue: 'produce-cvp.queue.v2',
  favorites: 'produce-cvp.favorites.v2',
  recents: 'produce-cvp.recents.v2',
  aliases: 'produce-cvp.aliases.v1',
  usage: 'produce-cvp.usage.v1',
  barcodeMappings: 'produce-cvp.barcodeMappings.v1'
};

const state = {
  query: '',
  filter: 'All',
  queue: load(STORAGE.queue, migrateQueue()),
  favorites: load(STORAGE.favorites, migrateSimple('produce-cvp.favorites.v1')),
  recents: load(STORAGE.recents, migrateSimple('produce-cvp.recents.v1')),
  aliases: load(STORAGE.aliases, {}),
  usage: load(STORAGE.usage, {}),
  barcodeMappings: load(STORAGE.barcodeMappings, {}),
  pendingBarcode: '',
  guideFilter: 'all',
  mysteryPhotoUrl: '',
  cameraStream: null,
  cameraTimer: null,
  rapidIndex: 0,
  wakeLock: null
};

const quickIds = [
  findId('4819', 'YUCCA ROOT'), findId('4744', 'DAIKON INDIAN'), findId('4795', 'TARO'),
  findId('4794', 'EDDOES'), findId('4786', 'TINDA'), findId('3141', 'SQUASH, LONG / OPO'),
  findId('3250', 'SQUASH,FUZZY'), findId('4761', 'SQUASH, CHAYOTE'), findId('4851', 'BITTER MELON, INDIAN (KARELLA)'),
  findId('3160', 'GAI LAN'), findId('7947', 'DRUMSTICK'), findId('4626', 'JICAMA')
].filter(Boolean);

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function migrateSimple(oldKey) { return load(oldKey, []); }
function migrateQueue() { return load('produce-cvp.queue.v1', []); }
function normalize(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function findId(plu, name) { return ITEMS.find(x => x.plu === plu && x.name === name)?.id; }
function byId(id) { return ITEMS.find(x => x.id === id); }
function customAliases(item) { return state.aliases[item.id] || []; }
function allAliases(item) { return [...(item.aliases || []), ...customAliases(item)]; }
function haptic(ms = 18) { try { navigator.vibrate?.(ms); } catch {} }


// Barcode → produce mapping. Exact mappings only; no guessed UPC/EAN → PLU conversions.
function canonicalBarcode(raw) {
  let value = String(raw ?? '').trim().replace(/\s+/g, '');
  if (/^[0-9-]+$/.test(value)) value = value.replace(/-/g, '');
  return value;
}

function barcodeVariants(raw) {
  const value = canonicalBarcode(raw);
  if (!value) return [];
  const out = new Set([value]);
  // UPC-A is commonly surfaced by scanners either as 12 digits or as EAN-13 with a leading zero.
  if (/^\d{12}$/.test(value)) out.add(`0${value}`);
  if (/^0\d{12}$/.test(value)) out.add(value.slice(1));
  return [...out];
}

function builtInBarcodeRecord(raw) {
  const variants = barcodeVariants(raw);
  for (const mapping of BUILTIN_BARCODES) {
    if (!mapping?.barcode || !mapping?.itemId) continue;
    if (barcodeVariants(mapping.barcode).some(v => variants.includes(v))) return mapping;
  }
  return null;
}

function localBarcodeRecord(raw) {
  for (const key of barcodeVariants(raw)) {
    const record = state.barcodeMappings[key];
    if (record?.itemId || typeof record === 'string') return { key, record };
  }
  return null;
}

function resolveBarcode(raw) {
  const local = localBarcodeRecord(raw);
  if (local) {
    const itemId = typeof local.record === 'string' ? local.record : local.record.itemId;
    const item = byId(itemId);
    if (item) return { item, source: 'local', matchedBarcode: local.key };
  }
  const built = builtInBarcodeRecord(raw);
  if (built) {
    const item = byId(built.itemId);
    if (item) return { item, source: 'built-in', matchedBarcode: built.barcode };
  }
  return null;
}

function localPrimaryMappings() {
  const seen = new Set();
  const rows = [];
  for (const [key, recordRaw] of Object.entries(state.barcodeMappings)) {
    const record = typeof recordRaw === 'string' ? { itemId: recordRaw, primary: key } : recordRaw;
    if (!record?.itemId) continue;
    const primary = canonicalBarcode(record.primary || key);
    if (!primary || seen.has(primary)) continue;
    const item = byId(record.itemId);
    if (!item) continue;
    seen.add(primary);
    rows.push({ barcode: primary, item, confirmedAt: Number(record.confirmedAt || 0) });
  }
  return rows.sort((a,b) => b.confirmedAt - a.confirmedAt || a.item.name.localeCompare(b.item.name));
}

function mappingsForItem(item) {
  const local = localPrimaryMappings().filter(x => x.item.id === item.id).map(x => ({...x, source:'local'}));
  const built = BUILTIN_BARCODES.filter(x => x.itemId === item.id).map(x => ({ barcode: canonicalBarcode(x.barcode), item, source:'built-in' }));
  return [...local, ...built].filter(x => x.barcode);
}

function saveBarcodeMapping(raw, item) {
  const primary = canonicalBarcode(raw);
  if (!primary || !item) return false;
  const previous = resolveBarcode(primary);
  if (previous && previous.item.id !== item.id) {
    const okay = confirm(`Barcode ${primary} is currently mapped to ${previous.item.name} (PLU ${previous.item.plu}). Replace it with ${item.name} (PLU ${item.plu})?`);
    if (!okay) return false;
  }
  const record = { itemId: item.id, primary, plu: item.plu, name: item.name, confirmedAt: Date.now() };
  for (const variant of barcodeVariants(primary)) state.barcodeMappings[variant] = record;
  save(STORAGE.barcodeMappings, state.barcodeMappings);
  renderBarcodeManager();
  return true;
}

function removeBarcodeMapping(raw) {
  const primary = canonicalBarcode(raw);
  if (!primary) return;
  for (const [key, recordRaw] of Object.entries({...state.barcodeMappings})) {
    const record = typeof recordRaw === 'string' ? { primary: key } : recordRaw;
    if (canonicalBarcode(record.primary || key) === primary || barcodeVariants(primary).includes(key)) delete state.barcodeMappings[key];
  }
  save(STORAGE.barcodeMappings, state.barcodeMappings);
  renderBarcodeManager();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function searchScore(item, rawQuery) {
  const q = normalize(rawQuery);
  if (!q) return 0;
  const name = normalize(item.name);
  const aliases = allAliases(item).map(normalize);
  const all = [name, ...aliases, item.plu];
  if (item.plu === q) return 1000;
  if (name === q || aliases.includes(q)) return 900;
  if (name.startsWith(q)) return 800;
  if (aliases.some(a => a.startsWith(q))) return 760;
  if (all.some(x => x.includes(q))) return 650;
  const qWords = q.split(' ');
  const tokens = all.join(' ').split(' ').filter(Boolean);
  const wordHits = qWords.filter(w => tokens.some(t => t.startsWith(w))).length;
  if (wordHits === qWords.length) return 560 + wordHits;
  if (q.length >= 4 && tokens.length) {
    const best = Math.min(...tokens.map(t => levenshtein(q, t)));
    if (best <= 1) return 420;
    if (best <= 2 && q.length >= 6) return 360;
  }
  return -1;
}

function groupFor(item) {
  const s = normalize(item.name + ' ' + allAliases(item).join(' '));
  if (/yucca|yam|potato|taro|eddo|arbi|jicama|daikon|lo bok|rutabaga|turnip|ginger|turmeric|parsnip|lotus root|carrot|beet/.test(s)) return 'Roots';
  if (/squash|pumpkin|tinda|chayote|karela|bitter melon|luffa|cucumber|zucchini|gourd|opo/.test(s)) return 'Gourds';
  if (/choy|lettuce|spinach|kale|gai lan|callaloo|methi|mustard|chard|watercress|rapini|cilantro|coriander|mint|parsley|curry leaf|celery/.test(s)) return 'Greens';
  if (/apple|banana|mango|melon|papaya|pear|peach|grape|orange|mandarin|dragonfruit|passionfruit|starfruit|soursop|guava|atemo|granadilla|lychee|jack|breadfruit|pomegranate|pomelo|grapefruit|nectarine|apricot|plum|persimmon|pineapple|kiwi|cherry|avocado/.test(s)) return 'Fruit';
  return 'Other';
}

function renderChips() {
  const filters = ['All', 'Saved', 'Frequent', 'Recent', 'Roots', 'Gourds', 'Greens', 'Fruit', 'EA', 'KG'];
  $('#categoryChips').innerHTML = filters.map(f => `<button class="filter-chip ${state.filter === f ? 'active' : ''}" data-filter="${f}" type="button">${f}</button>`).join('');
  $$('.filter-chip').forEach(btn => btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    renderChips(); renderResults();
  }));
}

function frequentItems(limit = 8) {
  return Object.entries(state.usage)
    .sort((a,b) => Number(b[1]) - Number(a[1]))
    .map(([id]) => byId(id)).filter(Boolean).slice(0, limit);
}

function renderFrequentStrip() {
  const items = frequentItems(6);
  const wrap = $('#frequentStrip');
  wrap.classList.toggle('hidden', items.length < 2 || !!state.query.trim());
  if (items.length < 2) return;
  wrap.innerHTML = `<div class="frequent-title">Your frequent items</div><div class="frequent-items">${items.map(item => `<button class="frequent-item" data-id="${item.id}" type="button">${item.emoji} ${esc(item.name)} · ${esc(item.plu)}</button>`).join('')}</div>`;
  $$('.frequent-item', wrap).forEach(btn => btn.addEventListener('click', () => openDetail(byId(btn.dataset.id))));
}

function filteredItems() {
  let items;
  if (state.query.trim()) {
    const barcodeHit = resolveBarcode(state.query);
    if (barcodeHit) items = [barcodeHit.item];
    else items = ITEMS.map(item => ({item, score: searchScore(item, state.query)})).filter(x => x.score >= 0).sort((a,b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).map(x => x.item);
  } else {
    items = quickIds.map(byId).filter(Boolean);
  }
  if (state.filter === 'Saved') return state.favorites.map(byId).filter(Boolean).filter(x => !state.query.trim() || items.some(i => i.id === x.id));
  if (state.filter === 'Recent') return state.recents.map(byId).filter(Boolean).filter(x => !state.query.trim() || items.some(i => i.id === x.id));
  if (state.filter === 'Frequent') return frequentItems(30).filter(x => !state.query.trim() || items.some(i => i.id === x.id));
  if (state.filter === 'EA' || state.filter === 'KG') return items.filter(x => x.unit === state.filter);
  if (['Roots','Gourds','Greens','Fruit'].includes(state.filter)) return items.filter(x => groupFor(x) === state.filter);
  return items;
}

function resultCard(item) {
  const aliases = allAliases(item);
  const alias = aliases.slice(0,3).join(' • ');
  return `<button class="product-card" data-id="${item.id}" type="button">
    <span class="emoji-box" aria-hidden="true" data-thumb-for="${item.id}">${item.emoji}</span>
    <span><span class="product-name">${esc(item.name)}</span><span class="alias-line">${esc(alias || (item.visual ? item.visual : 'Tap for details'))}</span></span>
    <span class="code-stack"><span class="plu">${esc(item.plu)}</span><span class="unit">${item.unit}</span></span>
  </button>`;
}

function renderResults() {
  const items = filteredItems();
  const hasQuery = !!state.query.trim();
  $('#resultTitle').textContent = hasQuery ? `Results for “${state.query.trim()}”` : 'Quick picks';
  $('#resultMeta').textContent = hasQuery ? `${items.length} match${items.length === 1 ? '' : 'es'} • PLU + unit from Q3 2026 sheet` : 'Common unlabeled / easy-to-confuse produce';
  $('#showAll').textContent = hasQuery ? 'Clear' : 'Show all';
  $('#results').innerHTML = items.map(resultCard).join('');
  $('#emptyState').classList.toggle('hidden', items.length !== 0);
  $$('.product-card').forEach(card => card.addEventListener('click', () => openDetail(byId(card.dataset.id))));
  hydrateReferenceThumbs(items);
  renderFrequentStrip();
}

function duplicatesFor(item) { return ITEMS.filter(x => x.plu === item.plu && x.id !== item.id); }
