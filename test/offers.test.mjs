import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCouponCode, isCredibleCjPromotion, normalizeCjOffer, normalizeDomain, parseMinimumSpend } from '../src/lib/offers.ts';
import { parseCjXml } from '../src/lib/cj-parser.ts';
import { CjSyncError, syncCjOffers } from '../src/lib/cj-link-search.ts';

const now = new Date('2026-09-09T12:00:00Z');

test('parses CJ XML records and entities', () => {
  const xml = `<cj-api><links total-matched="1" records-returned="1" page-number="1"><link><advertiser-id>42</advertiser-id><advertiser-name>UNice &amp; Co</advertiser-name><link-id>7</link-id><link-name>Save</link-name><description>Spend $100 &amp; save</description><promotion-type>coupon</promotion-type><coupon-code>SAVE</coupon-code><destination>https://www.unice.com/cart</destination><clickUrl>https://example.cj.com/click</clickUrl><last-updated>09/09/2026</last-updated></link></links></cj-api>`;
  const parsed = parseCjXml(xml);
  assert.equal(parsed.totalMatched, 1);
  assert.equal(parsed.records[0].advertiserName, 'UNice & Co');
});

test('extracts minimum spend without treating discount as threshold', () => {
  assert.equal(parseMinimumSpend('Save $20 on orders over $100'), 100);
  assert.equal(parseMinimumSpend('$75 minimum purchase'), 75);
  assert.equal(parseMinimumSpend('Save $20 today'), null);
});

test('normalizes domain, dates, ambiguity and expiration', () => {
  const offer = normalizeCjOffer({ advertiserId: '42', advertiserName: 'UNice', linkId: '7', linkName: 'Up to $50 off select wigs', description: 'Minimum purchase $100', promotionType: 'coupon', promotionStartDate: '09/01/2026', promotionEndDate: '09/08/2026', couponCode: 'SAVE', destination: 'https://www.unice.com/cart', clickUrl: 'https://example.cj.com/click', category: 'Hair', lastUpdated: '09/09/2026' }, now);
  assert.equal(normalizeDomain('WWW.UNICE.COM'), 'unice.com');
  assert.equal(offer.minimumSpend, 100);
  assert.equal(offer.requiresLiveVerification, true);
  assert.equal(offer.eligibilityConfidence, 'low');
  assert.equal(offer.active, false);
});

function cjRecord(overrides = {}) {
  return {
    advertiserId: '5824323', advertiserName: 'UNice', linkId: '7', linkName: '', description: '',
    promotionType: 'N/A', promotionStartDate: '', promotionEndDate: '', couponCode: '',
    destination: 'https://www.unice.com/cart', clickUrl: 'https://example.cj.com/click', category: 'Hair',
    lastUpdated: '09/09/2026', ...overrides
  };
}

test('includes N/A promotion types when the text has a clear discount', () => {
  assert.equal(isCredibleCjPromotion(cjRecord({ linkName: 'Up To $50 Off Select Wigs' })), true);
});

test('extracts only explicitly introduced coupon codes from N/A promotions', () => {
  const record = cjRecord({ linkName: 'Up To $50 Off With Code: TREAT50' });
  assert.equal(isCredibleCjPromotion(record), true);
  assert.equal(normalizeCjOffer(record, now).couponCode, 'TREAT50');
  assert.equal(extractCouponCode('Code: SUMMER40'), 'SUMMER40');
  assert.equal(extractCouponCode('Use Code XYZ'), 'XYZ');
  assert.equal(extractCouponCode('Learn how to use code for checkout'), null);
  assert.equal(extractCouponCode('Summer Hair Collection'), null);
});

test('rejects logo and generic non-promotional creatives', () => {
  assert.equal(isCredibleCjPromotion(cjRecord({ linkName: '150x40 Logo' })), false);
  assert.equal(isCredibleCjPromotion(cjRecord({ linkName: 'UNice Human Hair Wigs' })), false);
});

test('keeps a supplied CJ coupon code instead of a code found in text', () => {
  const offer = normalizeCjOffer(cjRecord({ linkName: 'Save With Code: TEXT40', couponCode: 'CJ50' }), now);
  assert.equal(offer.couponCode, 'CJ50');
});

test('stale undated CJ records are not refreshed by being observed again', () => {
  const record = cjRecord({ linkName: 'Save 40% Off', lastUpdated: '2026-01-01T00:00:00Z' });
  const first = normalizeCjOffer(record, new Date('2026-09-09T12:00:00Z'));
  const observedAgain = normalizeCjOffer(record, new Date('2026-09-20T12:00:00Z'));
  assert.equal(first.sourceUpdatedAt, '2026-01-01T00:00:00.000Z');
  assert.notEqual(first.observedAt, observedAgain.observedAt);
  assert.equal(first.active, false);
  assert.equal(observedAgain.active, false);
});

class SyncKv {
  values = new Map();

  async get(key, type) {
    const value = this.values.get(key) ?? null;
    return type === 'json' && value ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

function cjPage(page, total) {
  const start = (page - 1) * 100;
  const count = Math.max(0, Math.min(100, total - start));
  const links = Array.from({ length: count }, (_, index) => {
    const id = start + index + 1;
    return `<link><advertiser-id>5824323</advertiser-id><advertiser-name>UNice</advertiser-name><link-id>${id}</link-id><link-name>Save 10% Off</link-name><description>Use Code SAVE10</description><promotion-type>N/A</promotion-type><promotion-start-date></promotion-start-date><promotion-end-date></promotion-end-date><coupon-code></coupon-code><destination>https://www.unice.com/deal/${id}</destination><clickUrl>https://example.cj.com/click/${id}</clickUrl><category>Hair</category><last-updated>09/10/2026</last-updated></link>`;
  }).join('');
  return `<cj-api><links total-matched="${total}" records-returned="${count}" page-number="${page}">${links}</links></cj-api>`;
}

test('fetches all joined links across eight pages without a promotion-type filter', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    urls.push(url);
    return new Response(cjPage(Number(url.searchParams.get('page-number')), 740), { status: 200, headers: { 'Content-Type': 'application/xml' } });
  });
  const runtime = { CJ_PAT: 'test-pat', OFFERS: new SyncKv() };
  const result = await syncCjOffers(runtime, 'full', new Date('2026-09-10T12:00:00Z'));
  const snapshot = await runtime.OFFERS.get('snapshot:v1', 'json');

  assert.equal(urls.length, 8);
  assert.ok(urls.every((url) => url.searchParams.get('advertiser-ids') === 'joined'));
  assert.ok(urls.every((url) => !url.searchParams.has('promotion-type')));
  assert.equal(result.offersFetched, 740);
  assert.equal(result.offersStored, 740);
  assert.equal(result.pagesFetched, 8);
  assert.equal(snapshot.offers.length, 740);
});

test('refuses to store a snapshot when joined-link pagination exceeds the safety budget', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    return new Response(cjPage(Number(url.searchParams.get('page-number')), 2500), { status: 200 });
  });
  const runtime = { CJ_PAT: 'test-pat', OFFERS: new SyncKv() };

  await assert.rejects(
    syncCjOffers(runtime, 'full', new Date('2026-09-10T12:00:00Z')),
    (error) => error instanceof CjSyncError && error.category === 'pagination_safety_failure'
  );
  assert.equal(await runtime.OFFERS.get('snapshot:v1'), null);
});



