# Running ScanUganda

A step-by-step guide to starting the project, trying every part of it, and putting the mobile app on a phone.

## 1. What you need

| Tool | Version | Check |
|---|---|---|
| Node.js | 24 or newer (the API uses the built-in `node:sqlite`) | `node -v` |
| pnpm | 10 | `pnpm -v` (install: `npm i -g pnpm`) |
| Git | any | `git -v` |
| A browser | Chrome or Edge recommended | |

Versions are pinned in `.mise.toml`. Nothing else to install: the database is a file, and there are no external services.

## 2. Start it

```
git clone https://github.com/tashobya2324/ScanUganda.git
cd ScanUganda
pnpm install
pnpm dev
```

On the first run `pnpm dev` creates `apps/api/.env` with random local secrets, creates the database and loads sample data. It starts three things:

| Address | What |
|---|---|
| http://localhost:8443/ | **Web system** (console) for manufacturers, inspectors, admins |
| http://localhost:8443/app/ | **Mobile app** (PWA), the same app you install on a phone |
| http://localhost:3000/docs | API documentation |

Stop with `Ctrl+C`. If you ever run `pnpm install` again, **stop and restart `pnpm dev`**, or the page can go blank.

## 3. Sign in to the web system

| Account | Email | Password |
|---|---|---|
| Administrator | `admin@scanuganda.test` | `demo-password-1` |

The admin can create other users (manufacturer, inspector) under **Team**. These demo accounts are for development only.

## 4. Try the whole flow (5 minutes)

1. **Web system → Batches.** Open a batch, choose **Generate codes**. The 12-digit codes are shown **once**; download the CSV or **Print QR sheet**.
2. **Mobile app** (http://localhost:8443/app/). Tap **Scan QR code** and point the camera at a QR on screen or on paper, or tap **Type a code instead** and enter a 12-digit code. You get GENUINE, CHECK or STOP with the reason.
3. **Make something go wrong.** In the web system, **recall** the batch, then check the same code again: it now says STOP. Scan one code from two far-apart places and the system raises an "impossible travel" alert under **Alerts**.
4. **Go offline.** In the browser's developer tools set the network to Offline (or switch your phone to airplane mode). QR codes still check, never better than CHECK. Reconnect and the saved checks upload.
5. **USSD.** In the web system open **USSD simulator**, enter `*284#` and follow the menu, exactly as on a feature phone. See [USSD-GO-LIVE.md](USSD-GO-LIVE.md) for connecting a real aggregator.

## 5. Put the app on a phone

The app is a PWA: you "download" it from the browser, with no app store. Two things are needed: the phone must reach the app, and the address must be **https** (cameras and installing only work on https or `localhost`).

### No internet: phone and PC on the same network

The PC is the server; the phone connects straight to it.

1. **Network.** Put both on the same Wi-Fi. If a campus or public Wi-Fi blocks devices from seeing each other (the page never loads), use a hotspot instead: turn on the phone's hotspot and join the PC to it, or use Windows *Settings → Network → Mobile hotspot* and join the phone to the PC.
2. **Allow the port once** (PowerShell opened with *Run as administrator*):
   ```
   New-NetFirewallRule -DisplayName "ScanUganda dev (8443, local network)" -Direction Inbound -Protocol TCP -LocalPort 8443 -RemoteAddress LocalSubnet -Action Allow -Profile Any
   ```
3. **Find the PC's address:** `ipconfig`, the IPv4 address of the Wi-Fi adapter (for example `192.168.1.20`).
4. **Start** `pnpm dev`, then on the phone open `http://192.168.1.20:8443/app/` (your address instead).
5. **Make the camera and install work.** Browsers only allow these on https, and a plain local address is not https. On **Android Chrome** tell it to trust your PC's address: open `chrome://flags`, search *Insecure origins treated as secure*, enter `http://192.168.1.20:8443`, set it to *Enabled*, tap *Relaunch*. Now the camera and **Download the app** work. **iPhone** has no such switch: use the tunnel below, or type codes by hand over plain http.

### With internet: a temporary https tunnel to your laptop

```
pnpm dev
cloudflared tunnel --url http://localhost:8443
```

(`cloudflared` is a free download from Cloudflare; any tunnel tool such as ngrok works too.) It prints an `https://…` address. Open `https://…/app/` on the phone.

### Then install it

Open the app, and on the home screen tap the green **Download the app** button.

- **Android (Chrome, Edge, Samsung Internet):** one tap shows the system's install dialog. Confirm.
- **iPhone (Safari only):** Apple does not allow a one-tap install. The button shows the steps: **Share → Add to Home Screen → Add**.
- **Desktop Chrome/Edge:** same button, or the install icon in the address bar.

The app then appears with the other apps and opens full screen with no browser bars. The first time you are online it downloads the offline list; after that it works with no signal.

### Preview on a computer

Open http://localhost:8443/app/ and make the window narrow (or press `F12`, then the phone icon). On a wide screen the app is shown inside a phone-sized frame.

## 6. Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start everything |
| `pnpm test` | All unit and integration tests |
| `pnpm typecheck` | Type check every package |
| `pnpm e2e` | Real-browser test of the eight scenarios (builds its own throwaway stack; stop `pnpm dev` first on a low-memory machine) |
| `pnpm load` | Load check on the verify endpoint |
| `pnpm build` | Production build of the apps |

## 7. When something goes wrong

| Symptom | Fix |
|---|---|
| Page is blank, console says `__BUNDLED_DEV__ is not defined` | Stop and restart `pnpm dev` after any `pnpm install`. |
| `node:sqlite` error or "unexpected experimental" | Node is older than 24. Run `node -v` and upgrade. |
| Port already in use | Another copy is running. Stop it, or set `PORT=8450` before `pnpm dev`. |
| Camera does not start | Needs https or `localhost`; allow camera access in the browser's site settings; or type the code instead. |
| No **Download the app** button | It is hidden once installed. In a normal tab it appears on Home and Settings; some browsers (Firefox, Safari) show the manual steps instead of a one-tap install. |
| App shows old content after an update | Close all its tabs and reopen, or clear the site data. The service worker updates in the background. |
| Want a clean database | Stop `pnpm dev`, delete `apps/api/data/`, start again (sample data is recreated). |
| Computer freezes during `pnpm e2e` | It runs a browser and a server; close other heavy programs first. |

## 8. Before real users

Do not deploy the sample data or demo accounts. Follow the checklist in [SECURITY.md](SECURITY.md).
