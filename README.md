# Produce CVP Helper

A mobile-first personal helper for quickly identifying produce, finding the correct **PLU code**, confirming whether the item is entered by **KG** or **EA**, and staging a CVP queue before using the official Walmart handheld workflow.

> **Not a Walmart system.** This project does not connect to International Claims, pricing, inventory, label printing, employee accounts, or handheld APIs. It only helps with the manual lookup/identification step before the official device.

## Current data source

Starter data was transcribed from the user-provided photo of **Dept. 94: PRODUCE PLU CHART — 2026 Q3 (NATIONAL)**.

- 211 chart rows.
- Codes are stored as strings so leading-zero values such as `0434` and `0222` stay intact.
- Duplicate PLUs visible on the photographed chart are intentionally preserved rather than guessed away.

The photographed sheet is a **PLU chart**, not a universal UPC list. PLUs and store procedures can change, so the current in-store chart remains the source of truth.

## Fast workflow

1. Search/speak the produce name, nickname, or PLU.
2. Confirm the exact product name and whether the chart says **KG** or **EA**.
3. Add it to the queue.
4. Repeat for all bags/items.
5. Open **Rapid CVP** to work one item at a time with a large PLU, optional quantity, copy button, and **Done + Next**.
6. Enter the information into the official handheld as normal.

## Features

### Lookup speed
- Fast search by name, common alias, custom nickname, or PLU.
- Fuzzy typo matching.
- Useful aliases such as `cassava → YUCCA ROOT`, `mooli → DAIKON`, `karela → BITTER MELON`, `bhindi → OKRA`, `lauki/dudhi → OPO SQUASH`, and `dhania → CORIANDER/CILANTRO`.
- Frequently used items float into a personal quick strip automatically.
- Saved/favorite and recent filters.
- One-tap PLU copy.
- Read-aloud PLU for hands-busy situations.

### Voice
- Voice search when Web Speech Recognition is available.
- Tries multiple recognition alternatives and picks the phrase that best matches the local produce dataset.
- Supports simple commands such as `queue`, `guide`, and `add yucca`.
- Voice is a convenience feature only; typed search always remains available because browser support varies.

### Camera
- Live rear-camera mode via `getUserMedia()` on HTTPS-capable browsers.
- Uses the browser's native `BarcodeDetector` when available.
- An exact scanned 4–5 digit PLU opens the matching produce automatically.
- Longer UPC/EAN/GTIN values first check an **exact barcode → product → PLU mapping**. If none exists, the app never guesses. You can confirm the product once and save the barcode mapping locally; future scans jump straight to that PLU.
- Photo barcode scan fallback where `BarcodeDetector` supports image detection.
- Mystery-item photo capture lets you keep a photo visible while comparing the Visual Guide.

### PLU → scannable barcode
- Every produce detail screen and Rapid CVP screen can render the exact PLU digits as a **Code 128** barcode for faster scanning into a compatible handheld input field.
- The generated barcode contains only the PLU text (for example, `4819`). It is **not a UPC** and is not a Walmart-issued label.
- Barcode scanner/app acceptance can depend on the official handheld configuration, so test one known item before relying on this shortcut. Typing/copying the PLU remains the fallback.
- Barcode rendering is generated locally with no CDN or external service, so it remains available offline.

### Barcode → PLU memory
- Exact barcode mappings are supported for UPC/EAN/GTIN or any scanner-readable value.
- Unknown sticker barcode → choose the confirmed produce once → save mapping.
- Future scans of that exact barcode open the product and its PLU immediately.
- UPC-A 12-digit and equivalent EAN-13 leading-zero representations are treated as the same scanner value.
- Mappings target the exact produce record (not just a PLU), which matters when the chart has duplicate PLUs.
- Local mappings can be exported/imported as JSON for backup or transfer to another device.
- `data/barcodes.js` is reserved for built-in mappings that have been independently verified before being committed.
- The app never derives a PLU by chopping digits off an unknown barcode.

### Reliable visual identification aid
- Visual descriptions for commonly confused/unlabelled items.
- User can save a **reference photo from their own store** after an item is confirmed once.
- Reference photos are downscaled and stored locally in IndexedDB on that browser/device; they are not uploaded to GitHub.
- Saved reference photos replace emojis in relevant lookup/guide cards, creating a personalized store-specific visual guide over time.

### Queue / rapid CVP
- Queue stores optional kg/piece quantity.
- Repeated adds of the same unfinished produce record increment a staged-bag count instead of making cluttered duplicates.
- Rapid CVP gives one item at a time, giant PLU, KG/EA, quantity, Copy, Read, Previous/Next, and Done + Next.
- Requests a screen wake lock during Rapid CVP on browsers that support it.
- Copy queue summary for troubleshooting or temporary notes.

### Reliability safeguards
- Duplicate PLUs from the source chart trigger a warning listing the other product names using that code.
- Leading-zero PLUs remain intact.
- Camera scanner auto-opens an exact local PLU or an exact saved/verified barcode mapping.
- The app never invents a mapping from a long UPC/EAN/GTIN barcode to a PLU.
- Store data can change; the current store chart remains the final authority.

### Privacy / static hosting
- No backend, login, Walmart credential, store number, employee ID, customer information, or API key is required.
- Queue, saved items, usage history, aliases, recents and learned barcode mappings stay in browser local storage.
- Reference photos stay in browser IndexedDB.
- Suitable for static GitHub Pages hosting.

## GitHub Pages deployment

The project is intentionally build-free. Put these files at the repository root, then in GitHub:

1. **Settings → Pages**.
2. Choose **Deploy from a branch**.
3. Select the default branch (normally `main`) and `/ (root)`.
4. Save and wait for the Pages URL.
5. Open it once in Safari and use **Share → Add to Home Screen**.

GitHub Pages serves over HTTPS, which is required by browser camera APIs.

### Important visibility note

A private source repository does not automatically mean the published website is private. GitHub Pages access control for a privately published site is an Enterprise Cloud feature. Treat the deployed URL/content as potentially public unless your GitHub Pages settings explicitly say the site is private. Do not put Walmart credentials, internal secrets, customer data, or non-public operational information in this repository/site.

## Offline behavior

The service worker caches the core app/data after a successful load. Typed lookup, saved aliases, queue, and local reference photos can continue to work without a network connection. Voice recognition and some camera/barcode features may still depend on browser/device support and may not work offline.

## Why there is no automatic AI produce recognition

A static GitHub Pages site can run a generic image model in the browser, but general-purpose classifiers are not reliable enough to distinguish many look-alike roots, gourds and leafy vegetables for a workflow that can affect claims. A cloud vision model would also require an API/service and may expose photos or secrets.

Instead, this version uses a safer combination:

- camera for sticker/barcode reading when supported,
- a visual guide,
- a side-by-side mystery photo,
- and store-specific reference photos saved after a human confirms the item once.

This is intentionally designed to be useful without pretending an uncertain AI guess is authoritative.

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Updating the produce chart

The dataset is split across `data/produce-meta.js` and `data/produce-1.js` through `data/produce-4.js`. See `docs/DATA_NOTES.md` before editing.

When a new quarterly chart is available:

1. Keep a copy of the old dataset.
2. Transcribe the new chart carefully.
3. Preserve exact PLU formatting, including leading zeros.
4. Compare additions, removals, renamed products and KG/EA changes.
5. Re-check duplicate PLUs instead of automatically deduplicating.
6. Update `meta.version` in `data/produce-meta.js`.
7. Bump the cache name in `sw.js` so installed devices refresh.
