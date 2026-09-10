# HonorCart

HonorCart is a coupon browser extension designed to protect detected existing affiliate referrals. This repository contains the Astro/Cloudflare website and public API.

## Local development

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

Run the production checks with `npm run check`, offer tests with `npm run test:offers`, manual-sync tests with `npm run test:manual-sync`, and legacy extension tests with `npm run test:extension`.

## CJ offer ingestion

The Worker pulls the complete joined-advertiser Link Search inventory using promotional property/PID `101876786`, then conservatively classifies promotional links from CJ metadata and offer language. This includes credible promotions whose CJ `promotion-type` is `N/A`, while excluding generic logos, banners, navigation links, and records without meaningful offer language. It stores one sanitized-query source snapshot in the `OFFERS` KV binding. Incremental syncs run every six hours using CJ's `last-updated` parameter with a one-day overlap; a weekly full sync removes links CJ no longer returns. Explicit start/end dates remain authoritative, and undated offers use CJ's source-update timestamp rather than the latest HonorCart observation time so repeated syncs cannot make old promotions indefinitely fresh.

The public endpoint is `GET /api/offers?domain=unice.com`. It never returns the CJ PAT or the stored CJ tracking URL. Coupon lookup and coupon testing remain separate from affiliate activation and attribution decisions.

### One-time production setup

After the GitHub-connected deployment creates or updates the `honor-cart` Worker, open Cloudflare Dashboard → Workers & Pages → `honor-cart` → Settings → Variables and Secrets → Add. Create an encrypted **Secret** named `CJ_PAT`, paste the CJ Personal Access Token there, and deploy the saved secret. Do not add the token to GitHub, Wrangler configuration, extension files, logs, or chat.

The GitHub deployment uses Wrangler's automatic provisioning for the `OFFERS` KV binding and applies the cron triggers from `wrangler.json`; no manual export or direct Wrangler deployment is required.

### Protected manual CJ sync

Create a second encrypted Cloudflare **Secret** named `HONORCART_SYNC_ADMIN_TOKEN` under Cloudflare Dashboard → Workers & Pages → `honor-cart` → Settings → Variables and Secrets. Generate a strong, unique random value. Never put the value in GitHub, application files, logs, screenshots, or chat, and do not reuse `CJ_PAT`.

In PowerShell, prompt for the token so its value is not written into shell history, then trigger an incremental sync:

```powershell
$env:HC_SYNC_TOKEN = Read-Host "Paste HONORCART_SYNC_ADMIN_TOKEN"
Invoke-RestMethod -Method Post -Uri "https://honorcart.com/api/admin/cj-sync" -Headers @{ Authorization = "Bearer $env:HC_SYNC_TOKEN" } -ContentType "application/json" -Body '{"mode":"incremental"}'
```

For a full sync, use the same locally set environment variable:

```powershell
Invoke-RestMethod -Method Post -Uri "https://honorcart.com/api/admin/cj-sync" -Headers @{ Authorization = "Bearer $env:HC_SYNC_TOKEN" } -ContentType "application/json" -Body '{"mode":"full"}'
```

Remove the process-local token when finished:

```powershell
Remove-Item Env:HC_SYNC_TOKEN
```

The endpoint accepts only authenticated `POST` requests, applies a short cooldown, disables response caching, and returns sanitized counts plus confirmation that the `snapshot:v1` KV record used by `GET /api/offers` exists. Failure responses include a safe category and, for CJ HTTP failures, the upstream status. Send the complete JSON failure response when troubleshooting; it will not contain either secret or private CJ tracking URLs.

## Current product state

- Referral detection and monetization controls remain fail-closed.
- Global monetization and merchant activation remain disabled.
- The reviewer store continues to expose its simulated `HONOR10` coupon.
- UNice is recognized for CJ-backed coupon lookup; live DOM testing remains disabled until its selectors are validated (documented in the extension repository).
- `/api/events` still rejects telemetry until production authentication and privacy controls are connected.

See `docs/architecture.md` for data boundaries, metric definitions, extension decision order, and the production activation checklist.

## Deployment

The existing GitHub-connected Cloudflare deployment remains the deployment path. The Worker uses a custom Astro entrypoint only to add scheduled CJ sync handling; normal HTTP requests continue through Astro's official Cloudflare handler.

