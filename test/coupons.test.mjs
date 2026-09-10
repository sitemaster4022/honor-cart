import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCouponsRequest } from '../src/lib/coupon-api.ts';
import { findCjCouponMerchant } from '../src/lib/merchant-config.ts';

const now = new Date('2026-09-10T12:00:00Z');

function offer(overrides = {}) {
  return {
    id: 'cj:5824323:1',
    advertiserId: '5824323',
    merchantName: 'UNice',
    domain: 'unice.com',
    couponCode: 'BRAND',
    description: 'Up To $60 Off With Code: Brand!',
    promotionType: 'coupon',
    minimumSpend: null,
    currency: null,
    startDate: '2026-09-01T00:00:00Z',
    endDate: '2026-10-01T00:00:00Z',
    destinationUrl: 'https://www.unice.com/deal',
    cjTrackingUrl: 'https://www.anrdoezrs.net/click-private',
    source: 'cj',
    sourceUpdatedAt: '2026-09-09T00:00:00Z',
    observedAt: '2026-09-10T00:00:00Z',
    lastUpdatedAt: '2026-09-10T00:00:00Z',
    eligibilityConfidence: 'low',
    requiresLiveVerification: true,
    freeGift: { present: false, description: null },
    active: true,
    ...overrides
  };
}

function kv(snapshot, error = null) {
  return {
    calls: 0,
    async get(key, type) {
      this.calls += 1;
      assert.equal(key, 'snapshot:v1');
      assert.equal(type, 'json');
      if (error) throw error;
      return snapshot;
    }
  };
}

function request(host, path = '/') {
  return new URL(`https://honorcart.com/v1/coupons?host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`);
}

async function body(response) {
  return response.json();
}

test('www.unice.com resolves to UNice', () => {
  assert.equal(findCjCouponMerchant('www.unice.com')?.id, 'unice');
});

test('m.unice.com resolves to UNice without accepting lookalike domains', () => {
  assert.equal(findCjCouponMerchant('m.unice.com')?.id, 'unice');
  assert.equal(findCjCouponMerchant('evilunice.com'), undefined);
});

test('active CJ coupon offers appear and non-code offers are omitted', async () => {
  const store = kv({
    syncedAt: now.toISOString(),
    offers: [offer(), offer({ id: 'cj:5824323:2', couponCode: null, description: 'Sale without a code' })]
  });
  const response = await handleCouponsRequest(request('www.unice.com'), store, now);
  const payload = await body(response);

  assert.equal(response.status, 200);
  assert.equal(payload.merchantId, 'unice');
  assert.deepEqual(payload.coupons.map((coupon) => coupon.code), ['BRAND']);
});

test('duplicate coupon codes collapse case-insensitively to the strongest record', async () => {
  const store = kv({
    syncedAt: now.toISOString(),
    offers: [
      offer({
        id: 'cj:5824323:low',
        couponCode: 'brand',
        description: 'A much longer but low confidence Brand offer description',
        eligibilityConfidence: 'low',
        sourceUpdatedAt: '2026-09-10T00:00:00Z'
      }),
      offer({
        id: 'cj:5824323:high',
        couponCode: ' BRAND ',
        description: 'Preferred high confidence description',
        eligibilityConfidence: 'high',
        sourceUpdatedAt: '2026-09-01T00:00:00Z'
      })
    ]
  });
  const payload = await body(await handleCouponsRequest(request('m.unice.com'), store, now));

  assert.equal(payload.coupons.length, 1);
  assert.equal(payload.coupons[0].code, 'BRAND');
  assert.equal(payload.coupons[0].description, 'Preferred high confidence description');
  assert.equal(payload.coupons[0].eligibilityConfidence, 'high');
  assert.equal('verified' in payload.coupons[0], false);
});

test('newer CJ metadata and then more descriptive copy break equal-confidence ties', async () => {
  const store = kv({
    syncedAt: now.toISOString(),
    offers: [
      offer({ id: 'old', couponCode: 'SAVE', description: 'Old descriptive copy', eligibilityConfidence: 'medium', sourceUpdatedAt: '2026-09-01T00:00:00Z' }),
      offer({ id: 'new-short', couponCode: 'save', description: 'New', eligibilityConfidence: 'medium', sourceUpdatedAt: '2026-09-09T00:00:00Z' }),
      offer({ id: 'new-long', couponCode: 'SAVE', description: 'New and more descriptive copy', eligibilityConfidence: 'medium', sourceUpdatedAt: '2026-09-09T00:00:00Z' })
    ]
  });
  const payload = await body(await handleCouponsRequest(request('unice.com'), store, now));

  assert.equal(payload.coupons[0].description, 'New and more descriptive copy');
});

test('expired coupon offers are omitted', async () => {
  const store = kv({
    syncedAt: now.toISOString(),
    offers: [offer({ endDate: '2026-09-09T00:00:00Z' })]
  });
  const payload = await body(await handleCouponsRequest(request('unice.com'), store, now));

  assert.deepEqual(payload.coupons, []);
});

test('a supported merchant with no current coupon codes succeeds with an empty list', async () => {
  const response = await handleCouponsRequest(
    request('unice.com'),
    kv({ syncedAt: now.toISOString(), offers: [offer({ couponCode: '' })] }),
    now
  );
  const payload = await body(response);

  assert.equal(response.status, 200);
  assert.equal(payload.merchantId, 'unice');
  assert.deepEqual(payload.coupons, []);
});

test('reviewer store still returns HONOR10 without reading CJ storage', async () => {
  const store = kv(null, new Error('reviewer path must not access KV'));
  const response = await handleCouponsRequest(request('www.honorcart.com', '/reviewer-store'), store, now);
  const payload = await body(response);

  assert.equal(response.status, 200);
  assert.equal(payload.coupons[0].code, 'HONOR10');
  assert.equal(store.calls, 0);
});

test('unsupported domains remain unsupported without reading CJ storage', async () => {
  const store = kv(null, new Error('unsupported path must not access KV'));
  const response = await handleCouponsRequest(request('example.com'), store, now);
  const payload = await body(response);

  assert.equal(response.status, 404);
  assert.equal(payload.error, 'unsupported_merchant');
  assert.equal(store.calls, 0);
});

test('CJ tracking URLs are never returned publicly', async () => {
  const response = await handleCouponsRequest(
    request('unice.com'),
    kv({ syncedAt: now.toISOString(), offers: [offer()] }),
    now
  );
  const serialized = JSON.stringify(await body(response));

  assert.equal(serialized.includes('cjTrackingUrl'), false);
  assert.equal(serialized.includes('anrdoezrs.net'), false);
});

test('missing or unreadable CJ snapshot fails clearly', async () => {
  for (const store of [kv(null), kv(null, new Error('KV unavailable'))]) {
    const response = await handleCouponsRequest(request('unice.com'), store, now);
    const payload = await body(response);

    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '300');
    assert.equal(payload.error, 'offer_snapshot_unavailable');
    assert.equal(payload.status, 'sync_pending');
    assert.equal(payload.merchantId, 'unice');
    assert.deepEqual(payload.coupons, []);
  }
});
