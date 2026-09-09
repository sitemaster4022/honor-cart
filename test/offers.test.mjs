import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCjOffer, normalizeDomain, parseMinimumSpend } from '../src/lib/offers.ts';
import { parseCjXml } from '../src/lib/cj-parser.ts';

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



