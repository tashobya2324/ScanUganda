# PWA design and scope (Phase 4)

Date: 2026-11-06 · Tasks: P4-1 to P4-11 (and replaces the "move the prototype" part of P0-1)

## Context
PLAN §2 (A6) proposed `vite-plugin-pwa`, Dexie, and `zxing-wasm`. The repo also contains the original Figma Make prototype at the root, which Figma Make requires to stay at the root.

## Decisions
1. **`apps/pwa` is a new app, and the original prototype is now a mockup in `docs/mockups/`.** The team confirmed it was made to show how the system should *flow*, not look or be built (phone frame, sidebar and feature-phone drawing included). It was never wired to data, so nothing was ported; it is no longer served or compiled. The root preview at :8443 now serves the real web system (`apps/console`) and proxies the mobile app at `/app/` and the API at `/v1`.
2. **Both apps follow `docs/DESIGN.md`**, not the mockup's lime/hard-shadow look (confirmed by the same clarification).
2a. **The PWA can live at `/` or `/app/`.** Router basename, manifest, service-worker scope and the precache list are all relative, driven by `PWA_BASE`. In the service worker, cache lookups use `ignoreVary` because dev and preview servers send `Vary: Origin`, which otherwise made offline asset lookups miss (found and fixed with a real-browser test under `/app/`).
3. **Hand-written service worker instead of `vite-plugin-pwa`.** The plugin's peer range did not cover Vite 8 when this was written, and the need is small: precache the build's file list, serve pages network-first and assets cache-first. A 20-line Vite plugin emits the file list; the worker is ~60 lines and easy to read.
4. **Plain IndexedDB wrapper instead of Dexie.** Three stores, no migrations yet; nothing to download.
5. **QR decoding: native `BarcodeDetector` when present, `jsQR` otherwise** (lazy-loaded, ~48 kB gzipped, precached so it works offline). `zxing-wasm` was heavier for the same result.
6. **The phone never shows GENUINE from an offline check.** Offline is capped at CHECK (core's `verifyOffline`); the scan is queued and re-judged by the server. If the server later finds it unsafe, Home raises a notice.
7. **Typed codes cannot be checked offline.** The code is a server-side lookup. It is saved ("Not checked yet") and uploaded later.
8. **Luganda is not shipped.** The mechanism exists (`src/i18n/lg.ts`) but is empty: verdict wording is safety-critical and must be written by a fluent speaker, not guessed. Until then Luganda falls back to English. Tracked on the board under P4-11.
9. **Reports need a connection** (no offline queue for reports yet) and have no photo upload (the API does not support it yet).

## Verified
In headless Chromium with a fake camera showing a real QR: install of the service worker, offline list download, camera scan (online) → GENUINE, typed code → GENUINE, offline reload from the service worker, offline camera scan → CHECK, offline typed code → saved, batch recalled meanwhile, reconnect → queue uploads and Home warns that both offline checks are now unsafe.

## Not yet verified (Phase 4 exit gate)
- Install on a real mid-range Android phone via Chrome, and airplane-mode use there.
- Lighthouse PWA and accessibility scores (target ≥ 90). Basic accessibility is built in (labels, live regions, 48 px targets, reduced motion, shape + word for verdicts) but has not been audited.
- Behaviour on iOS Safari (no `beforeinstallprompt`; `BarcodeDetector` absent so `jsQR` is used).
- Real-world camera decoding of printed codes in poor light.
