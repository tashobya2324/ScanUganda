# ScanUganda PWA

Installable mobile web app for shoppers and shopkeepers. React + Vite + Tailwind v4. Talks to `apps/api` only; imports `packages/core` to judge QR codes offline.

## Run

```
pnpm --filter @scanuganda/api dev      # API on :3000 (see apps/api/README.md)
pnpm --filter @scanuganda/pwa dev      # http://localhost:5175, API proxied
```

The camera, location and service worker need a **secure context**: `localhost` works; a phone reaching your laptop over `http://192.168…` does not. To try it on a phone, use a tunnel with https (e.g. `cloudflared tunnel --url http://localhost:5175`) or the deployed build.

The service worker is registered **only in production builds**. To test offline behaviour:

```
pnpm --filter @scanuganda/pwa build && pnpm --filter @scanuganda/pwa preview   # http://localhost:5175
```

Open it once online (the app downloads itself and the offline list), then switch the network off in DevTools and reload.

## How it works

| Situation | What happens |
|---|---|
| Online, QR or typed code | `POST /v1/verify` → verdict, reasons, product. Stored in the phone's history. |
| Offline, QR code | `verifyOffline` (core) checks signature, expiry and the recall list from the last sync. Best answer: **CHECK**. The scan is queued. |
| Offline, typed code | Cannot be checked without the server. Saved as "Not checked yet" and queued. |
| Back online | The queue uploads (`/v1/sync/scans`, idempotent by `clientId`). Each scan is re-judged as of when it happened. If the server finds a scan **unsafe that the phone called CHECK**, Home shows a "Needs your attention" notice. |
| Offline list | Public keys, batches and recalls from `/v1/sync`, refreshed on start, on reconnect and every 6 h. Flagged as stale after 7 days. |

- **Typos** in the 12-digit code are caught on the phone by the check digit, before any request.
- **Not a ScanUganda QR** (a website, a barcode) is refused locally and never recorded.
- The full 12-digit code is kept only in the upload queue and deleted once the server answers; the history stores a masked label.
- Location is optional (Settings switch + browser permission). If there is no fix within 4 s the check goes ahead without it.

## Files

| Path | Role |
|---|---|
| `public/sw.js` | Service worker: precaches every build file listed in `precache-manifest.json`; pages network-first, assets cache-first; never caches `/v1/*` |
| `vite.config.ts` | Includes a small plugin that writes `precache-manifest.json` |
| `src/lib/scan.ts` | Orchestrates one check (online → server, offline → phone + queue) |
| `src/lib/sync.ts` | Offline-list refresh, queue upload, auto-sync triggers |
| `src/lib/db.ts` | IndexedDB: offline list, upload queue, history |
| `src/components/Scanner.tsx` | Camera QR reader: native `BarcodeDetector`, else `jsQR` (loaded only when needed) |
| `src/i18n/` | English strings; Luganda overrides (empty until reviewed) |

## Tests

`pnpm --filter @scanuganda/pwa test`: scan orchestration, sync queue, and key screens, against a fake IndexedDB.
