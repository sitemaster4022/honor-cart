# Privacy dashboard declarations

These answers must match the deployed release and hosted privacy policy.

## Chrome single-purpose field

Help shoppers retrieve coupon codes for the merchant they are currently visiting while protecting detected existing affiliate referrals from this extension's monetization.

## Permission justifications

- `activeTab`: Accesses the current tab only after the shopper opens the extension, so the popup can identify the merchant and perform user-requested coupon actions.
- `storage`: Stores the shopper's consent setting locally and holds attribution status in session-only storage. Session state is cleared when its tab closes.
- `webNavigation`: Observes top-level navigation addresses to detect supported affiliate-referral parameters and maintain protective per-tab state. Page contents are not read.
- Production API host: Communicates only with the extension's service to retrieve the merchant allowlist, requested coupons, and user-initiated affiliate activation.

## Data types to disclose

- Web history / browsing activity: top-level navigation addresses are processed locally to protect referrals; merchant hostname and path are transmitted when coupons are requested; a query-stripped page address would be transmitted only on explicit activation for an approved merchant. Activation is disabled in this release.
- User activity: deliberate coupon lookup and activation requests are processed to provide those features.

Select **Web history** and **User activity** in the store questionnaire because the policy requires disclosure even though most address processing stays on the device. No personally identifiable information, authentication information, personal communications, location, financial/payment information, or health information is intentionally collected by this release.

## Limited-use certification

Data is used only to provide or improve the extension's disclosed shopping functionality, protect referrals, secure the service, and comply with law. It is not sold, used for personalized advertising, or used for creditworthiness or lending. Human access is prohibited except with specific consent, for security, to comply with law, or after aggregation/anonymization for internal operations.
