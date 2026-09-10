import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCouponLookup } from '../src/lib/coupon-api.ts';

const now = new Date('2026-09-10T12:00:00Z');

function offer(overrides = {}) {
  return {
    id: 'cj:5824323:1', advertiserId: '5824323', merchantName: 'UNice', domain: 'unice.com',
    couponCode: 'BRAND', description: 'Up To $60 Off With Code: Brand!', promotionType: 'unknown',
    minimumSpend: null, currency: null, startDate: '2026-09-01T00:00:00Z', endDate: '2026-10-01T00:00:00Z',
    destinationUrl: 'https://www.unice.com/', cjTrackingUrl: 'https://www.anrdoezrs.net/click/private', source: 'cj',
    sourceUpdatedAt: '2026-09-09T00:00:00Z', observedAt: '2026-09-10T00:00:00Z', lastUpdatedAt: '2026-09-10T00:00:00Z',
    eligibilityConfidence: 'medium', requiresLiveVerification: true, freeGift: { present: false, description: null }, active: true,
    ...overrides
  };
}

function kv(snapshot) {
  return { async get(key, type) { assert.equal(key, 'snapshot:v1'); assert.equal(type, 'json'); return snapshot; } };
}

async function lookup(host, offers, path = '/') {
  const url = new URL('https://honorcart.com/v1/coupons');
  url.searchParams.set('host', host);
  url.searchParams.set('path', path);
  const response = await handleCouponLookup(url, kv({ offers, syncedAt: now.toISOString() }), now);
  return { response, body: await response.json() };
}

test('www.unice.com and m.unice.com resolve to the UNice merchant', async () => {
  for (const host of ['www.unice.com', 'm.unice.com']) {
    const { response, body } = await lookup(host, [offer()]);
    assert.equal(response.status, 200);
    assert.equal(body.merchantId, 'unice');
    assert.equal(body.coupons[0].code, 'BRAND');
  }
});

test('returns only active CJ offers with coupon codes', async () => {
  const { body } = await lookup('unice.com', [
    offer(),
    offer({ id: 'cj:5824323:2', couponCode: null, description: 'Save 20% today' }),
    offer({ id: 'cj:5824323:3', couponCode: 'EXPIRED', endDate: '2026-09-09T00:00:00Z' })
  ]);
  assert.deepEqual(body.coupons.map((coupon) => coupon.code), ['BRAND']);
});

test('deduplicates codes case-insensitively and chooses confidence, freshness, then useful copy', async () => {
  const offers = [
    offer({ id: 'low', couponCode: 'brand', eligibilityConfidence: 'low', sourceUpdatedAt: '2026-09-10T00:00:00Z', description: 'Newest but low confidence' }),
    offer({ id: 'old', couponCode: 'BRAND', eligibilityConfidence: 'high', sourceUpdatedAt: '2026-09-08T00:00:00Z', description: 'Older high confidence' }),
    offer({ id: 'short', couponCode: 'Brand', eligibilityConfidence: 'high', sourceUpdatedAt: '2026-09-09T00:00:00Z', description: 'Save with code' }),
    offer({ id: 'useful', couponCode: 'brand', eligibilityConfidence: 'high', sourceUpdatedAt: '2026-09-09T00:00:00Z', description: 'Save $60 off orders with code BRAND' })
  ];
  const { body } = await lookup('www.unice.com', offers);
  assert.equal(body.coupons.length, 1);
  assert.deepEqual(body.coupons[0], {
    code: 'BRAND', description: 'Save $60 off orders with code BRAND', minimumSpend: null,
    eligibilityConfidence: 'high', source: 'cj'
  });
});

test('never returns CJ tracking URLs', async () => {
  const { body } = await lookup('unice.com', [offer()]);
  assert.equal(JSON.stringify(body).includes('anrdoezrs'), false);
  assert.equal('cjTrackingUrl' in body.coupons[0], false);
});

test('reviewer store still returns HONOR10 without reading CJ storage', async () => {
  const url = new URL('https://honorcart.com/v1/coupons?host=www.honorcart.com&path=/reviewer-store/checkout');
  const response = await handleCouponLookup(url, { async get() { throw new Error('must not read'); } }, now);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.merchantId, 'honorcart-reviewer-store');
  assert.equal(body.coupons[0].code, 'HONOR10');
});

test('unsupported domains remain unsupported and do not read the snapshot', async () => {
  const url = new URL('https://honorcart.com/v1/coupons?host=example.com&path=/');
  const response = await handleCouponLookup(url, { async get() { throw new Error('must not read'); } }, now);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'unsupported_merchant', coupons: [] });
});

test('an existing snapshot with no coupon codes returns an empty successful result', async () => {
  const { response, body } = await lookup('unice.com', [offer({ couponCode: null })]);
  assert.equal(response.status, 200);
  assert.deepEqual(body, { merchantId: 'unice', coupons: [] });
});

test('a missing snapshot returns a clear temporary failure for the supported merchant', async () => {
  const url = new URL('https://honorcart.com/v1/coupons?host=m.unice.com&path=/');
  const response = await handleCouponLookup(url, kv(null), now);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '300');
  assert.deepEqual(await response.json(), {
    error: 'offers_temporarily_unavailable', merchantId: 'unice', coupons: []
  });
});
