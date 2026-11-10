# LUG/ATELIER — 3D custom boot configurator

Dark editorial, mobile-first configurator for a 6-inch work boot. The boot is built
entirely from procedural Three.js geometry — no model, texture or HDRI files are downloaded.

## Run

Requires Node.js 18.18+ (20 LTS recommended).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000.

## Telegram orders

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. Send the bot any message, then get your chat id from [@userinfobot](https://t.me/userinfobot).
3. Fill in both values in `.env.local` (template: `.env.example`), then restart the dev server.
4. Open http://localhost:3000/api/order — it should report `"telegramConfigured": true`.

Each order arrives as a photo card (the captured 3D look) with the full spec, price and contact details.
Without the env vars the form returns a clear "not configured" error instead of failing silently.

## Structure

```
app/
  layout.tsx            fonts, metadata, viewport
  page.tsx              renders the configurator
  globals.css           theme, glass, grain
  api/order/route.ts    validates the order, recomputes price, posts to Telegram
components/
  Configurator.tsx      stage, capture, bottom sheet / side panel, order flow
  ControlPanel.tsx      leather, laces, sole, stamp, size, price breakdown
  OrderForm.tsx         contact form with instant validation
  boot/surfaceNets.ts   meshes a signed distance field into a smooth surface
  boot/geometry.ts      procedural boot: sculpted upper + collar, stitching, hex eyelets, braided laces, lug sole
  boot/BootViewer.tsx   R3F canvas, materials, studio environment, controls, snapshot
lib/
  config.ts             options, pricing, config validation (shared client/server)
  validation.ts         contact validation (shared client/server)
  telegram.ts           Bot API client: sendPhoto → sendDocument → sendMessage fallbacks
```

Options and prices live in `lib/config.ts`; the brand name is the `BRAND` constant there.
