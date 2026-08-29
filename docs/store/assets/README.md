# Store assets

- `store-logo-300.png`: Edge listing logo. The extension's padded 128×128 icon is used by Chrome and is included inside the release ZIP.
- `promo-small-440x280.jpg`: required Chrome small promotional tile and compatible Edge small tile.
- `promo-source.png`: high-resolution source for future crops.
- `screenshot-clean-640x400.png`: coupon result and disabled-activation state in the controlled reviewer environment.
- `screenshot-protected-640x400.png`: protected-referral stand-down state using the documented `afsrc=1` test marker.

The two 640×400 listing screenshots are browser-rendered composites of the current extension markup, styling, copy, and live reviewer states. Before submission, compare them against a final unpacked-build run in Chrome and recapture them if any visible text or behavior changes. Also capture the onboarding disclosure if the selected store supports a third screenshot.

The HonorCart brand icon and promo artwork were generated with the built-in image-generation workflow on August 29, 2026. Run a trademark review before public release.
