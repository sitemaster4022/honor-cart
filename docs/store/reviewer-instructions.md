# Reviewer instructions

## Prerequisites

No account or credentials are required.

## First-run test

1. Install the extension. The privacy and affiliate disclosure page opens automatically.
2. Confirm the coupon controls are unavailable before consent.
3. Check the consent box and select **Enable coupon lookup**.

## Supported-merchant test

Open `https://honorcart.com/reviewer-store`. This is a controlled, non-commercial test environment. Select **Find coupons** and confirm the deterministic reviewer-only code `HONOR10` appears. The code is clearly labeled simulated and is not redeemable.

## Stand-down test

Open `https://honorcart.com/reviewer-store?afsrc=1` in a new tab.

1. Open the supplied referral-marker URL.
2. Open the extension.
3. Confirm it displays **Existing referral protected**.
4. Confirm affiliate activation is disabled while coupon lookup remains available.

## Disabled-activation test

1. Open the supplied unclaimed-session test URL in a new tab.
2. Open the extension and confirm it reports no detected referral.
3. Select **Find coupons**; confirm coupons are displayed without navigation or affiliate activation.
4. Confirm the activation control reads **Affiliate activation unavailable** and remains disabled because neither the global switch nor the reviewer merchant is approved for monetization.
5. If testing the endpoint directly, confirm `POST https://honorcart.com/v1/activate` returns `403 monetization_disabled`.

## Kill-switch test

The submitted release already operates in its fail-closed state: activation is unavailable in the popup and rejected by the API. No operational credentials are required.
