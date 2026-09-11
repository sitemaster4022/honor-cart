import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMerchantInventoryReport } from '../src/lib/merchant-inventory.ts';
import { handleMerchantInventoryRequest } from '../src/lib/merchant-inventory-admin.ts';

const now = new Date('2026-09-10T12:00:00Z');

function offer(overrides = {}) {
  return {
    id: 'cj:100:1',
    advertiserId: '100',
    merchantName: 'Example Store',
    domain: 'example.com',
    couponCode: 'SAVE20',
    description: 'Save 20% with code SAVE20',
    promotionType: 'coupon',
    minimumSpend: null,
    currency: null,
    startDate: '2026-09-01T00:00:00Z',
    endDate: '2026-12-31T00:00:00Z',
    destinationUrl: 'https://example.com/deal',
    cjTrackingUrl: 'https://private.cj.example/click/1',
    source: 'cj',
    sourceUpdatedAt: '2026-09-09T00:00:00Z',
    observedAt: '2026-09-10T00:00:00Z',
    lastUpdatedAt: '2026-09-10T00:00:00Z',
    eligibilityConfidence: 'high',
    requiresLiveVerification: true,
    freeGift: { present: false, description: null },
    active: true,
    ...overrides
  };
}

function snapshot(offers) {
  return { syncedAt: '2026-09-10T11:00:00.000Z', offers };
}

class FakeKv {
  constructor(value, error = null) {
    this.value = value;
    this.error = error;
  }

  async get(key, type) {
    assert.equal(key, 'snapshot:v1');
    assert.equal(type, 'json');
    if (this.error) throw this.error;
    return this.value;
  }
}

function adminRequest(token, query = '') {
  return new Request('https://honorcart.com/api/admin/merchant-inventory' + query, {
    method: 'GET',
    headers: token ? { Authorization: 'Bearer ' + token } : {}
  });
}

test('aggregates by advertiser ID and keeps subdomains together', () => {
  const report = buildMerchantInventoryReport(snapshot([
    offer({ id: 'cj:100:1', domain: 'shop.example.com' }),
    offer({ id: 'cj:100:2', domain: 'example.com', couponCode: 'save20' }),
    offer({ id: 'cj:200:1', advertiserId: '200', merchantName: 'Example Store', domain: 'example.net', couponCode: 'NET10' })
  ]), now);

  assert.equal(report.summary.merchantCount, 2);
  const example = report.merchants.find((merchant) => merchant.advertiserId === '100');
  assert.ok(example);
  assert.equal(example.primaryDomain, 'example.com');
  assert.deepEqual(example.domains, ['example.com', 'shop.example.com']);
  assert.equal(example.uniqueCouponCodeCount, 1);

  const separateAdvertiser = report.merchants.find((merchant) => merchant.advertiserId === '200');
  assert.equal(separateAdvertiser.merchantName, 'Example Store');
});

test('uses current activity rules instead of the stored active flag', () => {
  const report = buildMerchantInventoryReport(snapshot([
    offer({ id: 'expired', endDate: '2026-09-01T00:00:00Z', active: true }),
    offer({ id: 'future', startDate: '2026-10-01T00:00:00Z', active: true }),
    offer({ id: 'stale-undated', endDate: null, sourceUpdatedAt: '2026-01-01T00:00:00Z', active: true }),
    offer({ id: 'current', endDate: null, sourceUpdatedAt: '2026-09-09T00:00:00Z', active: false })
  ]), now);

  const merchant = report.merchants.find((candidate) => candidate.advertiserId === '100');
  assert.equal(merchant.totalSnapshotRecords, 4);
  assert.equal(merchant.currentlyActiveRecords, 1);
  assert.deepEqual(merchant.uniqueCouponCodes, ['SAVE20']);
});

test('counts usable codes case-insensitively and keeps no-code promotions separate', () => {
  const report = buildMerchantInventoryReport(snapshot([
    offer({ id: 'high', couponCode: 'save20', eligibilityConfidence: 'high' }),
    offer({ id: 'duplicate', couponCode: 'SAVE20', eligibilityConfidence: 'low' }),
    offer({ id: 'medium', couponCode: 'brand', eligibilityConfidence: 'medium' }),
    offer({ id: 'uncoded', couponCode: null, eligibilityConfidence: 'high', description: 'Sale without a code' }),
    offer({ id: 'inactive-code', couponCode: 'OLD', endDate: '2026-09-01T00:00:00Z' })
  ]), now);

  const merchant = report.merchants.find((candidate) => candidate.advertiserId === '100');
  assert.equal(merchant.currentlyActiveRecords, 4);
  assert.equal(merchant.codedRecords, 3);
  assert.equal(merchant.totalSnapshotCodedRecords, 4);
  assert.equal(merchant.uniqueCouponCodeCount, 2);
  assert.deepEqual(merchant.uniqueCouponCodes, ['BRAND', 'SAVE20']);
  assert.equal(merchant.uncodedPromotionCount, 1);
  assert.equal(merchant.highConfidenceCodedCount, 1);
  assert.equal(merchant.mediumConfidenceCodedCount, 1);
  assert.equal(merchant.lowConfidenceCodedCount, 1);
});

test('keeps merchants with no usable domain visible', () => {
  const report = buildMerchantInventoryReport(snapshot([
    offer({ domain: null, destinationUrl: null })
  ]), now);

  const merchant = report.merchants.find((candidate) => candidate.advertiserId === '100');
  assert.equal(merchant.primaryDomain, null);
  assert.equal(merchant.domainStatus, 'domain_unresolved');
  assert.deepEqual(merchant.domains, []);
});

test('joins UNice readiness and excludes validated merchants from recommendations', () => {
  const report = buildMerchantInventoryReport(snapshot([
    offer({ id: 'unice-1', advertiserId: '5824323', merchantName: 'UNice', domain: 'unice.com', couponCode: 'VPART' }),
    offer({ id: 'unice-2', advertiserId: '5824323', merchantName: 'UNice', domain: 'shop.unice.com', couponCode: 'BRAND' }),
    offer({ id: 'next-1', advertiserId: '300', merchantName: 'Next One', domain: 'nextone.com', couponCode: 'A' }),
    offer({ id: 'next-2', advertiserId: '300', merchantName: 'Next One', domain: 'nextone.com', couponCode: 'B' }),
    offer({ id: 'zero', advertiserId: '400', merchantName: 'No Codes', domain: 'nocodes.com', couponCode: null })
  ]), now);

  const unice = report.merchants.find((merchant) => merchant.advertiserId === '5824323');
  assert.equal(unice.readinessStage, 'live_validated');
  assert.equal(unice.readinessSource, 'registry');
  assert.equal(unice.inMerchantConfig, true);
  assert.equal(unice.merchantConfigId, 'unice');
  assert.equal(unice.couponSupportEnabled, true);
  assert.equal(unice.affiliateNetwork, 'cj');
  assert.equal(report.recommendedNextMerchants.some((merchant) => merchant.advertiserId === '5824323'), false);
  assert.deepEqual(report.recommendedNextMerchants.slice(0, 2).map((merchant) => merchant.advertiserId), ['300', '400']);
  assert.equal(report.merchants.find((merchant) => merchant.advertiserId === '400').readinessStage, 'inventory_only');
});

test('ranking uses unique codes before confidence and resolved domains', () => {
  const report = buildMerchantInventoryReport(snapshot([
    offer({ id: 'coded-1', advertiserId: '500', merchantName: 'Coded', domain: 'coded.com', couponCode: 'ONE' }),
    offer({ id: 'coded-2', advertiserId: '500', merchantName: 'Coded', domain: 'coded.com', couponCode: 'TWO' }),
    offer({ id: 'confidence-1', advertiserId: '600', merchantName: 'Confidence', domain: 'confidence.com', couponCode: 'ONE', eligibilityConfidence: 'low' }),
    offer({ id: 'confidence-2', advertiserId: '600', merchantName: 'Confidence', domain: 'confidence.com', couponCode: 'TWO', eligibilityConfidence: 'low' }),
    offer({ id: 'zero-domain', advertiserId: '700', merchantName: 'Zero Domain', domain: null, couponCode: null }),
    offer({ id: 'zero-domain-code', advertiserId: '700', merchantName: 'Zero Domain', domain: null, couponCode: 'CODE' })
  ]), now);

  assert.deepEqual(
    report.recommendedNextMerchants.map((merchant) => merchant.advertiserId),
    ['500', '600', '700']
  );
  assert.equal(report.ranking.method, 'lexicographic');
});

test('admin endpoint rejects missing and invalid credentials', async () => {
  const runtime = { HONORCART_SYNC_ADMIN_TOKEN: 'admin-secret', OFFERS: new FakeKv(snapshot([])) };
  assert.equal((await handleMerchantInventoryRequest(adminRequest(null), runtime, now)).status, 401);
  assert.equal((await handleMerchantInventoryRequest(adminRequest('wrong'), runtime, now)).status, 401);
});

test('valid admin endpoint returns a no-store sanitized report and supports filters', async () => {
  const runtime = {
    HONORCART_SYNC_ADMIN_TOKEN: 'admin-secret',
    CJ_PAT: 'cj-secret',
    OFFERS: new FakeKv(snapshot([offer()]))
  };
  const response = await handleMerchantInventoryRequest(
    adminRequest('admin-secret', '?domain=example.com&advertiserId=100'),
    runtime,
    now
  );
  const text = await response.text();
  const body = JSON.parse(text);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.summary.merchantCount, 1);
  assert.equal(body.merchants[0].advertiserId, '100');
  assert.equal(text.includes('cjTrackingUrl'), false);
  assert.equal(text.includes('private.cj.example'), false);
  assert.equal(text.includes('cj-secret'), false);
  assert.equal(text.includes('admin-secret'), false);
});

test('admin endpoint reports missing snapshots without caching', async () => {
  const response = await handleMerchantInventoryRequest(
    adminRequest('admin-secret'),
    { HONORCART_SYNC_ADMIN_TOKEN: 'admin-secret', OFFERS: new FakeKv(null) },
    now
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
