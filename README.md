# HonorCart

HonorCart is a coupon browser extension designed to protect detected existing affiliate referrals. This repository contains the Chromium Manifest V3 extension, its store-review materials, and the Astro/Cloudflare website and API it uses.

## Local development

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

Run the production checks with:

```sh
npm run check
npm run test:extension
```

Package the store ZIP with:

```powershell
npm run package:extension
```

The ZIP is written to `artifacts/extension/honorcart-1.0.0.zip` with the manifest at its root. Extension artifacts are kept outside the website deployment directory.

## Current product state

- The extension requires first-run consent and maintains referral state per tab.
- Coupon lookup occurs only after the shopper opens the popup and selects **Find coupons**.
- The global and reviewer-merchant monetization switches are both off; `/v1/activate` rejects every request.
- `/reviewer-store` returns the simulated, non-redeemable `HONOR10` coupon for store review.
- Public trust, privacy, disclosure, support, and product routes are deployed at `https://honorcart.com`.
- `/dashboard`, `/login`, and `/signup` are clearly labeled preview/scaffolding experiences.
- Every referral and monetary dashboard figure is sample data.
- `/api/policy.json` returns a fail-safe policy with monetization disabled.
- `/api/events` rejects telemetry until production controls are connected.
- `migrations/0001_creator_dashboard_foundation.sql` defines the future D1 model.

## Extension review

1. Load the `extension` directory as an unpacked extension.
2. Complete the disclosure and consent screen.
3. Open `https://honorcart.com/reviewer-store` and retrieve `HONOR10`.
4. Open `https://honorcart.com/reviewer-store?afsrc=1` in a new tab and confirm that the popup reports **Existing referral protected**.

Submission copy, privacy questionnaire answers, reviewer instructions, assets, and the owner checklist are in `docs/store`.

See [docs/architecture.md](docs/architecture.md) for data boundaries, metric definitions, the extension decision order, and the production activation checklist.

## Deployment

The existing Cloudflare Workers adapter and Wrangler configuration are preserved. Provision D1 before activating account or event ingestion, add its binding to `wrangler.json`, and regenerate `worker-configuration.d.ts` with `npm run cf-typegen`.
