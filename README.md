# Produce PLU Helper

An independent, mobile-first helper for identifying produce, looking up PLU codes, confirming whether an item is handled by weight (`KG`) or count (`EA`), and staging a short personal lookup queue.

## Independence / non-affiliation

This is a personal open-source utility. It is **not affiliated with, endorsed by, sponsored by, certified by, or connected to any retailer or employer**. It does not connect to employer systems, claims systems, inventory, pricing, authentication, label printers, or handheld APIs.

Do not add retailer logos, trademarks, employee credentials, store/location identifiers, customer information, internal screenshots, confidential documents, or private operational information to the public repository.

## Data caution

PLU codes are industry identifiers used for loose produce. The International Federation for Produce Standards (IFPS) publishes globally used PLU codes and also documents retailer-assigned PLU ranges. Retailer-assigned mappings can differ between retailers.

This repository contains a manually curated lookup dataset. It may contain mistakes, outdated values, or retailer/local mappings. **Do not treat the repository as an authoritative source.** Verify any unusual or conflicting value against the current approved source for your workplace before using it operationally.

For a public deployment, the safest approach is:

- keep globally/publicly verifiable PLU data in the repository;
- keep retailer-specific barcode or PLU mappings local to the browser/device;
- never publish confidential workplace source documents or credentials;
- do not imply that this project is an official workplace tool.

## Main features

- Search by produce name, alias, PLU, or locally learned barcode.
- Fuzzy typo matching and custom nicknames.
- Voice search where the browser supports Web Speech Recognition.
- Camera/barcode scanning where the browser supports the Barcode Detection API.
- Exact barcode → produce/PLU mappings saved locally in the browser.
- UPC-A / EAN-13 leading-zero equivalence handling.
- Export/import of personal barcode mappings as JSON.
- Optional local reference photos stored in IndexedDB.
- Queue / rapid mode for one-item-at-a-time lookup.
- PLU read-aloud.
- Optional Code 128 rendering that encodes the PLU digits exactly.
- Offline caching after a successful first load.

## Barcode safety

The app never guesses a PLU by chopping digits off a longer UPC/EAN/GTIN. Unknown barcodes require a one-time human confirmation before a mapping is stored.

The generated Code 128 image simply encodes the displayed PLU digits. It is **not** a UPC, GS1 identifier, retailer-issued label, or replacement for an official barcode. Whether a workplace scanner accepts such a Code 128 value depends on that scanner and software configuration; test only in accordance with workplace policy.

## Browser limitations

Camera and voice functions are progressive enhancements. Browser support varies. Typed search is the primary fallback.

Core data, aliases, queue state, favorites, usage history, and learned barcode mappings are stored locally in browser storage. Reference photos are stored locally in IndexedDB.

## GitHub Pages

This is a static site and can be published from the repository root:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose `main` and `/ (root)`.
4. Save and wait for the Pages deployment to complete.

The camera API requires a secure context; GitHub Pages uses HTTPS.

## Privacy

No sign-in, employee ID, store number, workplace credentials, or customer data are required by the app. Do not commit such information to this repository.

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Updating data

When updating produce data:

1. Prefer publicly verifiable industry PLU information.
2. Preserve exact PLU formatting, including leading zeros.
3. Re-check product name and `KG` / `EA` handling.
4. Treat duplicate codes as a reason to verify, not something to silently deduplicate.
5. Keep retailer-specific mappings local rather than committing them publicly unless you have authorization to publish them.
6. Run the validation workflow before deploying.
