# Submission checklist

## Completed in the codebase

- Manifest V3 release candidate
- Narrow `activeTab`, `storage`, and `webNavigation` permissions
- First-run data disclosure and affirmative consent
- Visible affiliate disclosure in onboarding and popup
- Local referral detection and session-only attribution state
- Separate coupon lookup and affiliate activation actions
- Global and merchant-level fail-closed kill switches
- HTTPS-only release packaging script
- 16, 32, 48, and 128 px icons
- 300 px Edge listing logo and 440×280 Chrome/Edge promotional tile
- Store listing, privacy declaration, and reviewer-instruction drafts
- Production HTTPS API at `https://honorcart.com`
- Controlled reviewer store with deterministic `HONOR10` result
- Public privacy, support, affiliate-disclosure, and stand-down-policy pages
- Extension source, tests, packaging script, and reviewer documents versioned in the website repository
- Store URLs replaced with the live `honorcart.com` routes
- Global kill switch enforced in both popup state and backend activation
- Referral protection retained across supported same-merchant navigation and short tracking redirects
- Two current 640×400 Chrome listing screenshots covering coupon lookup and referral stand-down

## Required owner/deployment inputs before submission

- Verify the HonorCart product name through trademark, extension-store, domain, and social-handle searches.
- Confirm the developer's legal identity and jurisdiction in each store publisher account.
- Confirm that `support@honorcart.com` and `privacy@honorcart.com` are monitored.
- Document any Cloudflare dashboard log-retention setting used by the production account.
- Obtain written approval for at least one merchant/network test integration.
- Replace the stub coupon and affiliate adapters with approved production adapters.
- Compare the supplied screenshots against the final unpacked build and capture the onboarding disclosure as an optional third screenshot.
- Complete Chrome and Edge privacy questionnaires consistently with `privacy-declarations.md`.
- Conduct security, legal/privacy, and merchant-terms review.

## Build commands

From the project directory:

```powershell
.\scripts\package-extension.ps1 -ApiBase https://honorcart.com -Version 1.0.0
```

Upload the resulting ZIP from `artifacts/extension`. Its manifest is at the ZIP root. Do not place extension packages in the website `dist` directory.
