'use strict';

// Explicit barcode display for loose PLUs and packaged UPC-A products.
// Loose produce: Code 128 encoding of the exact PLU digits.
// Packaged products: UPC-A encoding of the exact 12-digit package barcode.
(() => {
  const CODE128_PATTERNS = [
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

  const UPC_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const UPC_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  function code128Codes(text) {
    const value = String(text ?? '');
    if (!value || !/^[\x20-\x7e]+$/.test(value)) return null;
    const codes = [104];
    for (const ch of value) codes.push(ch.charCodeAt(0) - 32);
    let checksum = 104;
    for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
    codes.push(checksum % 103, 106);
    return codes;
  }

  function code128Svg(text, compact = false) {
    const codes = code128Codes(text);
    if (!codes) return '';
    const moduleWidth = 2;
    const quiet = 10;
    const height = compact ? 58 : 82;
    let moduleX = quiet;
    const bars = [];
    for (const code of codes) {
      const pattern = CODE128_PATTERNS[code];
      if (!pattern) return '';
      for (let i = 0; i < pattern.length; i++) {
        const width = Number(pattern[i]);
        if (i % 2 === 0) bars.push(`<rect x="${moduleX * moduleWidth}" y="0" width="${width * moduleWidth}" height="${height}"/>`);
        moduleX += width;
      }
    }
    const widthPx = (moduleX + quiet) * moduleWidth;
    return `<svg class="display-barcode-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${height}" role="img" aria-label="Code 128 barcode for ${esc(text)}" preserveAspectRatio="xMidYMid meet"><rect width="100%" height="100%" fill="white"/><g fill="black">${bars.join('')}</g></svg>`;
  }

  function validUpcA(code) {
    const value = String(code || '');
    if (!/^\d{12}$/.test(value)) return false;
    const d = [...value].map(Number);
    const expected = (10 - (((d[0]+d[2]+d[4]+d[6]+d[8]+d[10]) * 3 + d[1]+d[3]+d[5]+d[7]+d[9]) % 10)) % 10;
    return expected === d[11];
  }

  function upcASvg(code) {
    const value = String(code || '');
    if (!validUpcA(value)) return '';
    let bits = '101';
    for (let i = 0; i < 6; i++) bits += UPC_L[Number(value[i])];
    bits += '01010';
    for (let i = 6; i < 12; i++) bits += UPC_R[Number(value[i])];
    bits += '101';

    const quiet = 10;
    const moduleWidth = 2;
    const height = 82;
    const bars = [];
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === '1') bars.push(`<rect x="${(quiet + i) * moduleWidth}" y="0" width="${moduleWidth}" height="${height}"/>`);
    }
    const width = (quiet * 2 + bits.length) * moduleWidth;
    return `<svg class="display-barcode-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="UPC-A barcode ${esc(value)}" preserveAspectRatio="xMidYMid meet"><rect width="100%" height="100%" fill="white"/><g fill="black">${bars.join('')}</g></svg>`;
  }

  function inlineCard({ code, kind = 'plu', compact = false } = {}) {
    const value = String(code || '').trim();
    const isUpc = kind === 'upc';
    const barcode = isUpc ? upcASvg(value) : code128Svg(value, compact);
    if (!barcode) return '';
    return `<div class="plu-barcode-card ${compact ? 'compact' : ''}">
      <button class="plu-barcode-open" type="button" data-show-barcode-code="${esc(value)}" data-show-barcode-kind="${isUpc ? 'upc' : 'plu'}" aria-label="Open larger barcode">
        <div class="plu-barcode-heading"><strong>${isUpc ? 'Package barcode' : `Scan PLU ${esc(value)}`}</strong><span>${isUpc ? 'UPC-A' : 'CODE 128'}</span></div>
        ${barcode}
        <div class="plu-barcode-human">${esc(value)}</div>
      </button>
      ${compact ? '' : `<div class="plu-barcode-note">Tap the barcode for a larger view. ${isUpc ? 'Confirm the package name/size before use.' : 'Encodes the PLU digits only; it is not a UPC.'}</div>`}
    </div>`;
  }

  function ensureOverlay() {
    let overlay = document.getElementById('barcodeDisplayOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'barcodeDisplayOverlay';
    overlay.className = 'barcode-display-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="barcode-display-sheet">
        <button class="barcode-display-close" type="button" aria-label="Close barcode">×</button>
        <div class="barcode-display-content" id="barcodeDisplayContent"></div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => {
      overlay.classList.add('hidden');
      document.body.classList.remove('barcode-overlay-open');
    };
    overlay.querySelector('.barcode-display-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    return overlay;
  }

  function show({ code, kind = 'plu', title = '' } = {}) {
    const value = String(code || '').trim();
    const isUpc = kind === 'upc';
    const graphic = isUpc ? upcASvg(value) : code128Svg(value, false);
    if (!graphic) {
      window.toast?.(isUpc ? 'That package barcode is not a valid UPC-A' : 'Could not generate barcode');
      return false;
    }

    const overlay = ensureOverlay();
    const content = overlay.querySelector('#barcodeDisplayContent');
    content.innerHTML = `
      <span class="kicker">${isUpc ? 'Package barcode' : 'Loose produce PLU'}</span>
      <h2>${esc(title || (isUpc ? 'Package UPC' : `PLU ${value}`))}</h2>
      <div class="barcode-popup-label">${isUpc ? 'UPC-A' : 'CODE 128'}</div>
      <div class="barcode-popup-graphic">${graphic}</div>
      <div class="barcode-popup-human">${esc(value)}</div>
      <p class="barcode-popup-note">${isUpc
        ? 'Exact UPC-A from the packaged-product catalog. Confirm the product name/size on the physical package.'
        : 'Encodes only the PLU digits. It is not a UPC or retailer-issued label. Test scanner acceptance with an approved handheld.'}</p>`;
    overlay.classList.remove('hidden');
    document.body.classList.add('barcode-overlay-open');
    return true;
  }

  function bindInlineBarcodeButtons(root = document) {
    root.querySelectorAll('[data-show-barcode-code]').forEach(btn => {
      if (btn.dataset.barcodeBound === '1') return;
      btn.dataset.barcodeBound = '1';
      btn.addEventListener('click', () => show({
        code: btn.dataset.showBarcodeCode,
        kind: btn.dataset.showBarcodeKind || 'plu'
      }));
    });
  }

  function injectDetail() {
    const body = document.querySelector('#detailContent .detail-body');
    const code = body?.querySelector('.big-code')?.textContent?.trim();
    const row = body?.querySelector('.big-code-row');
    if (!body || !row || !/^\d{4,5}$/.test(code || '')) return;
    if (!body.querySelector('.plu-barcode-card')) row.insertAdjacentHTML('afterend', inlineCard({ code, kind: 'plu', compact: false }));
    bindInlineBarcodeButtons(body);
  }

  function injectRapid() {
    const root = document.querySelector('#rapidContent');
    const code = root?.querySelector('.rapid-plu')?.textContent?.trim();
    const unit = root?.querySelector('.rapid-unit');
    if (!root || !unit || !/^\d{4,5}$/.test(code || '')) return;
    if (!root.querySelector('.plu-barcode-card')) unit.insertAdjacentHTML('afterend', inlineCard({ code, kind: 'plu', compact: true }));
    bindInlineBarcodeButtons(root);
  }

  window.BARCODE_UI = {
    show,
    inlineCard,
    bind: bindInlineBarcodeButtons,
    code128Svg,
    upcASvg,
    validUpcA,
    refresh() { injectDetail(); injectRapid(); }
  };

  const style = document.createElement('style');
  style.textContent = `
    .plu-barcode-card{margin-top:14px;background:#fff;border:1px solid var(--line,#dce5df);border-radius:14px;padding:12px;overflow:hidden;color:#111}
    .plu-barcode-open{display:block;width:100%;border:0;background:transparent;padding:0;color:#111;cursor:pointer}
    .plu-barcode-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;font-size:12px}
    .plu-barcode-heading span,.barcode-popup-label{font-size:9px;letter-spacing:.08em;font-weight:900;color:#667169;border:1px solid #dce5df;border-radius:999px;padding:3px 6px}
    .display-barcode-svg{display:block;width:100%;max-width:520px;height:86px;margin:0 auto;background:#fff;shape-rendering:crispEdges}
    .plu-barcode-human,.barcode-popup-human{text-align:center;font:900 17px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;margin-top:6px;color:#111}
    .plu-barcode-note{margin-top:8px;color:#667169;font-size:10px;line-height:1.35;text-align:center}
    .rapid-content .plu-barcode-card{margin:18px 0 0;border-color:rgba(255,255,255,.2);padding:10px}
    .rapid-content .display-barcode-svg{height:62px}
    .rapid-content .plu-barcode-human{font-size:14px}
    .barcode-display-overlay{position:fixed;inset:0;z-index:9999;background:rgba(8,20,13,.68);backdrop-filter:blur(3px);display:grid;place-items:center;padding:14px}
    .barcode-display-overlay.hidden{display:none!important}
    .barcode-display-sheet{position:relative;width:min(94vw,620px);max-height:calc(100dvh - 28px);overflow:auto;border-radius:22px;background:#fff;box-shadow:0 30px 80px rgba(0,0,0,.34)}
    .barcode-display-close{position:absolute;top:9px;right:9px;z-index:2;width:40px;height:40px;border:0;border-radius:999px;background:#f1f4f2;color:#17231c;font-size:26px;line-height:1;cursor:pointer}
    .barcode-display-content{padding:28px 20px 22px;text-align:center;background:#fff;color:#111}
    body.barcode-overlay-open{overflow:hidden}
    .barcode-display-content h2{margin:5px 42px 10px;font-size:21px}
    .barcode-popup-label{display:inline-flex;margin-bottom:10px}
    .barcode-popup-graphic{background:#fff;border:1px solid #e1e7e3;border-radius:14px;padding:14px 8px}
    .barcode-popup-human{font-size:21px;margin-top:10px;overflow-wrap:anywhere}
    .barcode-popup-note{color:#667169;font-size:11px;line-height:1.45;margin:12px auto 0;max-width:500px}
    @media(max-width:420px){.display-barcode-svg{height:76px}.rapid-content .display-barcode-svg{height:56px}.barcode-display-content{padding:26px 14px 18px}.barcode-popup-human{font-size:18px}}
  `;
  document.head.appendChild(style);

  const detail = document.getElementById('detailContent');
  const rapid = document.getElementById('rapidContent');
  if (detail) new MutationObserver(() => injectDetail()).observe(detail, {childList:true, subtree:true});
  if (rapid) new MutationObserver(() => injectRapid()).observe(rapid, {childList:true, subtree:true});
  injectDetail();
  injectRapid();
})();
