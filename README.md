# HonorCart

HonorCart is a coupon browser extension designed to protect detected existing affiliate referrals. This repository contains the Astro/Cloudflare website and public API.

## Local development

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

Run the production checks with `npm run check`, offer tests with `npm run test:offers`, and legacy extension tests with `npm run test:extension`.

## CJ offer ingestion

The Worker pulls coupon, sale/discount, and free-shipping links for joined CJ advertisers using promotional property/PID `101876786`. It stores one sanitized-query source snapshot in the `OFFERS` KV binding. Incremental syncs run every six hours using CJ's `last-updated` parameter with a one-day overlap; a weekly full sync removes links CJ no longer returns. Expired, not-yet-active, and stale undated offers are excluded from public recommendations.

The public endpoint is `GET /api/offers?domain=unice.com`. It never returns the CJ PAT or the stored CJ tracking URL. Coupon lookup and coupon testing remain separate from affiliate activation and attribution decisions.

### One-time production setup

After the GitHub-connected deployment creates or updates the `honor-cart` Worker, open Cloudflare Dashboard → Workers & Pages → `honor-cart` → Settings → Variables and Secrets → Add. Create an encrypted **Secret** named `CJ_PAT`, paste the CJ Personal Access Token there, and deploy the saved secret. Do not add the token to GitHub, Wrangler configuration, extension files, logs, or chat.

The GitHub deployment uses Wrangler's automatic provisioning for the `OFFERS` KV binding and applies the cron triggers from `wrangler.json`; no manual export or direct Wrangler deployment is required.

## Current product state

- Referral detection and monetization controls remain fail-closed.
- Global monetization and merchant activation remain disabled.
- The reviewer store continues to expose its simulated `HONOR10` coupon.
- UNice is recognized for CJ-backed coupon lookup; live DOM testing remains disabled until its selectors are validated (documented in the extension repository).
- `/api/events` still rejects telemetry until production authentication and privacy controls are connected.

See `docs/architecture.md` for data boundaries, metric definitions, extension decision order, and the production activation checklist.

## Deployment

The existing GitHub-connected Cloudflare deployment remains the deployment path. The Worker uses a custom Astro entrypoint only to add scheduled CJ sync handling; normal HTTP requests continue through Astro's official Cloudflare handler.

