# HonorCart

HonorCart is a coupon product designed to protect existing affiliate referrals. This repository contains the Astro 5 public website, a creator-dashboard product preview, and the Cloudflare/D1 foundation for future extension telemetry.

## Local development

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

Run the production checks with:

```sh
npm run check
```

## Current product state

- Public trust and product routes are production-ready static pages.
- `/dashboard`, `/login`, and `/signup` are clearly labeled preview/scaffolding experiences.
- Every referral and monetary dashboard figure is sample data.
- `/api/policy.json` returns a fail-safe policy with monetization disabled.
- `/api/events` rejects telemetry until production controls are connected.
- `migrations/0001_creator_dashboard_foundation.sql` defines the future D1 model.

See [docs/architecture.md](docs/architecture.md) for data boundaries, metric definitions, the extension decision order, and the production activation checklist.

## Deployment

The existing Cloudflare Workers adapter and Wrangler configuration are preserved. Provision D1 before activating account or event ingestion, add its binding to `wrangler.json`, and regenerate `worker-configuration.d.ts` with `npm run cf-typegen`.
