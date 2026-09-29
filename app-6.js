'use strict';

// Optional PLU -> Code 128 barcode display.
// Encodes the PLU digits exactly; this is not a UPC or a Walmart-issued label.
(() => {
  const PATTERNS = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212',
    '112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131',
    '311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321',
    '112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121',
    '313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114',
    '122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212',
    '124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113',
    '114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'
  ];

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  function encode(text) {
    const value = String(text ?? '');
    if (!value || !/^[\x20-\x7e]+$/.test(value)) return null;
    const codes = [104]; // Code 128 Start B
    for (const ch of value) codes.push(ch.charCodeAt(0) - 32);
    let checksum = 104;
    for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
    codes.push(checksum % 103, 106);
    return codes;
  }

  function svg(text, compact = false) {
    const codes = encode(text);
    if (!codes) return '';
    const moduleWidth = 2;
    const quiet = 10;
    const height = compact ? 58 : 72;
    let moduleX = quiet;
    const bars = [];
    for (const code of codes) {
      const pattern = PATTERNS[code];
      if (!pattern) return '';
      for (let i = 0; i < pattern.length; i++) {
        const width = Number(pattern[i]);
        if (i % 2 === 0) bars.push(`<rect x="${moduleX * moduleWidth}" y="0" width="${width * moduleWidth}" height="${height}"/>`);
        moduleX += width;
      }
    }
    const widthPx = (moduleX + quiet) * moduleWidth;
    return `<svg class="plu-barcode-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${height}" role="img" aria-label="Code 128 barcode for PLU ${escapeHtml(text)}" preserveAspectRatio="xMidYMid meet"><rect width="100%" height="100%" fill="white"/><g fill="black">${bars.join('')}</g></svg>`;
  }

  function card(plu, compact = false) {
    return `<div class="plu-barcode-card ${compact ? 'compact' : ''}">
      <div class="plu-barcode-heading"><strong>Scan PLU ${escapeHtml(plu)}</strong><span>CODE 128</span></div>
      ${svg(plu, compact)}
      <div class="plu-barcode-human">${escapeHtml(plu)}</div>
      ${compact ? '' : '<div class="plu-barcode-note">Encodes only the PLU digits. It is not a UPC. Test one known item on the official handheld before relying on scanning.</div>'}
    </div>`;
  }

  function injectDetail() {
    const body = document.querySelector('#detailContent .detail-body');
    const code = body?.querySelector('.big-code')?.textContent?.trim();
    const row = body?.querySelector('.big-code-row');
    if (!body || !row || !/^\d{4,5}$/.test(code || '') || body.querySelector('.plu-barcode-card')) return;
    row.insertAdjacentHTML('afterend', card(code, false));
  }

  function injectRapid() {
    const root = document.querySelector('#rapidContent');
    const code = root?.querySelector('.rapid-plu')?.textContent?.trim();
    const unit = root?.querySelector('.rapid-unit');
    if (!root || !unit || !/^\d{4,5}$/.test(code || '') || root.querySelector('.plu-barcode-card')) return;
    unit.insertAdjacentHTML('afterend', card(code, true));
  }

  const style = document.createElement('style');
  style.textContent = `
    .plu-barcode-card{margin-top:14px;background:#fff;border:1px solid var(--line,#dce5df);border-radius:14px;padding:12px;overflow:hidden;color:#111}
    .plu-barcode-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;font-size:12px}
    .plu-barcode-heading span{font-size:9px;letter-spacing:.08em;font-weight:900;color:#667169;border:1px solid #dce5df;border-radius:999px;padding:3px 6px}
    .plu-barcode-svg{display:block;width:100%;max-width:520px;height:78px;margin:0 auto;background:#fff;shape-rendering:crispEdges}
    .plu-barcode-human{text-align:center;font:900 16px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.24em;margin-top:5px;color:#111}
    .plu-barcode-note{margin-top:8px;color:#667169;font-size:10px;line-height:1.35;text-align:center}
    .rapid-content .plu-barcode-card{margin:18px 0 0;border-color:rgba(255,255,255,.2);padding:10px}
    .rapid-content .plu-barcode-svg{height:62px}
    .rapid-content .plu-barcode-human{font-size:14px}
    @media(max-width:420px){.plu-barcode-svg{height:68px}.rapid-content .plu-barcode-svg{height:56px}}
  `;
  document.head.appendChild(style);

  const detail = document.getElementById('detailContent');
  const rapid = document.getElementById('rapidContent');
  if (detail) new MutationObserver(injectDetail).observe(detail, {childList:true, subtree:true});
  if (rapid) new MutationObserver(injectRapid).observe(rapid, {childList:true, subtree:true});
  injectDetail();
  injectRapid();
})();
