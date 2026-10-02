'use strict';
const fs = require('fs');
const vm = require('vm');
global.window = {};

function load(path) {
  vm.runInThisContext(fs.readFileSync(path, 'utf8'), { filename: path });
}

load('data/produce-meta.js');
for (let i = 1; i <= 4; i++) load(`data/produce-${i}.js`);
load('data/produce-i18n.js');
load('data/packaged-products.js');

if (!window.PRODUCE_DATA || window.PRODUCE_DATA.items.length !== 211) {
  throw new Error('Expected 211 loose produce rows');
}
if (!Array.isArray(window.PRODUCE_I18N_RULES) || window.PRODUCE_I18N_RULES.length < 60) {
  throw new Error('Multilingual rule catalog is unexpectedly small');
}
for (const lang of ['esCO','esES','esUS','fr','hi','gu','fil']) {
  if (!window.PRODUCE_I18N_LANG_LABELS?.[lang]) throw new Error(`Missing language label: ${lang}`);
  if (!window.PRODUCE_I18N_RULES.some(r => Array.isArray(r.names?.[lang]) && r.names[lang].length)) {
    throw new Error(`No aliases found for language: ${lang}`);
  }
}

function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}\p{M}]+/gu,' ').trim();
}
function ruleMatchesItem(rule, item) {
  const haystack = norm([item.name, ...(item.aliases || [])].join(' '));
  const padded = ` ${haystack} `;
  const has = term => {
    const p = norm(term);
    return !!p && padded.includes(` ${p} `);
  };
  if ((rule.exclude || []).some(has)) return false;
  return (rule.match || []).some(has);
}
const requiredLangs = ['esCO','esES','esUS','fr','hi','gu','fil'];
const uncovered = [];
for (const item of window.PRODUCE_DATA.items) {
  const matching = window.PRODUCE_I18N_RULES.filter(rule => ruleMatchesItem(rule,item));
  const missing = requiredLangs.filter(lang => !matching.some(rule => Array.isArray(rule.names?.[lang]) && rule.names[lang].length));
  if (missing.length) uncovered.push({ name: item.name, missing });
}
if (uncovered.length) {
  throw new Error(`Produce items missing requested language aliases: ${uncovered.map(x => `${x.name} [${x.missing.join(',')}]`).join('; ')}`);
}

const appleRule = window.PRODUCE_I18N_RULES.find(r => r.match?.includes('apple'));
if (!appleRule?.names?.esCO?.includes('manzana')) throw new Error('Spanish apple alias missing');
if (!appleRule?.names?.fr?.includes('pomme')) throw new Error('French apple alias missing');
if (!appleRule?.names?.hi?.some(x => x.includes('सेब'))) throw new Error('Hindi apple alias missing');
if (!appleRule?.names?.gu?.some(x => x.includes('સફરજન'))) throw new Error('Gujarati apple alias missing');
if (!appleRule?.names?.fil?.includes('mansanas')) throw new Error('Filipino apple alias missing');

const packages = window.PACKAGED_PRODUCTS;
if (!Array.isArray(packages) || packages.length < 50) throw new Error('Packaged catalog is unexpectedly small');
const ids = new Set();
const barcodes = new Set();

function validUpcA(code) {
  if (!/^\d{12}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.forEach((d,i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

for (const p of packages) {
  if (!p.id || ids.has(p.id)) throw new Error(`Duplicate/missing package id: ${p.id}`);
  ids.add(p.id);
  if (!p.name || !p.category || !p.sourceUrl) throw new Error(`Incomplete packaged item: ${p.id}`);
  if (!/^\d{12}$/.test(p.barcode)) throw new Error(`Packaged UPC must be 12 digits: ${p.id} ${p.barcode}`);
  if (!validUpcA(p.barcode)) throw new Error(`Invalid UPC-A check digit: ${p.id} ${p.barcode}`);
  if (barcodes.has(p.barcode)) throw new Error(`Duplicate packaged UPC: ${p.barcode}`);
  barcodes.add(p.barcode);
}

console.log(`OK: ${packages.length} packaged UPCs and ${window.PRODUCE_I18N_RULES.length} multilingual rules validated`);


for (let i = 1; i <= 6; i++) {
  const source = fs.readFileSync(`app-${i}.js`, 'utf8');
  const lines = source.split(/\r?\n/);
  const bad = lines
    .map((line, index) => ({line, number:index + 1}))
    .filter(x => /(^|[^$])\$\([^\n]*\)\.forEach\s*\(/.test(x.line));
  if (bad.length) {
    throw new Error(`Single-element selector used with forEach in app-${i}.js: ${bad.map(x => x.number).join(', ')}`);
  }
}
console.log('OK: selector usage validation passed');
