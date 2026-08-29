# Creator dashboard and extension-event foundation

The current site is deliberately fail-safe: `/api/policy.json` disables monetization and `/api/events` refuses telemetry until production authentication, D1, consent, retention, and privacy controls are connected.

The versioned `extension` directory contains the current Manifest V3 client. It requests the allowlist from `/v1/config`, retrieves the reviewer coupon from `/v1/coupons` only after explicit user action, and cannot activate monetization while either approval switch is off. Referral processing and per-tab state remain local to the browser in this release.

## Data boundary

The initial D1 migration models creators, hashed affiliate identifiers, network and merchant configuration, protected-referral events, and server-controlled flags. Affiliate identifiers should be normalized and keyed with a server-side HMAC before storage; plaintext identifiers and secret network credentials do not belong in event records.

Each future extension event should use a cryptographic UUID and contain only the references and measurement fields represented by `ProtectedReferralEvent`. Do not send full destination URLs, browsing histories, payment data, or shopper identity.

## Decision order

1. Fetch the signed/versioned policy with a short cache lifetime.
2. Fail closed if policy is absent, stale, or invalid.
3. Apply global, network, merchant, and offer kill switches.
4. Detect and lock any supported existing referral before considering monetization.
5. Emit a protection event asynchronously only after consent and ingestion authentication are available.

## Dashboard definitions

- **Protected referral:** HonorCart matched a registered identifier and stood down.
- **Unique merchant session:** a privacy-safe deduplicated session count.
- **Checkout value observed:** a supported merchant subtotal, not a confirmed sale.
- **Potential commission:** an estimate from a disclosed rate assumption.
- **Network-confirmed:** reserved for data received from an authenticated network source.

## Production activation checklist

- Provision D1 and add its generated binding to `wrangler.jsonc`.
- Run `wrangler types` after binding changes.
- Choose an authentication provider and implement secure sessions, CSRF protection, rate limiting, and email verification.
- Protect event ingestion with extension attestation/signatures, replay protection, bounded schema validation, and rate limits.
- Restrict production activation to approved extension origins after store IDs are assigned; treat CORS as a browser control, not authentication.
- Complete legal review, retention periods, deletion/export flows, and subprocessor disclosures.
- Build creator reporting only after real, creator-scoped event sources and metric qualifications are available.
