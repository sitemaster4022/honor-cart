import test from 'node:test';
import assert from 'node:assert/strict';
import '../rules.js';

const { STATES, hasReferralSignal, merchantFor, nextAttributionState } = globalThis.HonorCartRules;

const merchants = [{
  id: 'review',
  displayName: 'Reviewer store',
  domains: ['honorcart.com'],
  pathPrefixes: ['/reviewer-store'],
  monetizationApproved: false
}];

test('detects known referral parameters case-insensitively', () => {
  assert.equal(hasReferralSignal('https://honorcart.com/reviewer-store?afsrc=1'), true);
  assert.equal(hasReferralSignal('https://honorcart.com/reviewer-store?RANSITEID=x'), true);
  assert.equal(hasReferralSignal('https://honorcart.com/reviewer-store?color=green'), false);
});

test('requires both global and merchant approval before monetization is available', () => {
  const rawUrl = 'https://honorcart.com/reviewer-store';
  assert.equal(nextAttributionState({ rawUrl, merchants, globalMonetizationEnabled: true }).monetizationEnabled, false);
  const approved = [{ ...merchants[0], monetizationApproved: true }];
  assert.equal(nextAttributionState({ rawUrl, merchants: approved, globalMonetizationEnabled: false }).monetizationEnabled, false);
  assert.equal(nextAttributionState({ rawUrl, merchants: approved, globalMonetizationEnabled: true }).monetizationEnabled, true);
});

test('keeps a detected referral protected after its query marker disappears', () => {
  const first = nextAttributionState({
    rawUrl: 'https://honorcart.com/reviewer-store?afsrc=1',
    merchants,
    now: 1000
  });
  const second = nextAttributionState({
    rawUrl: 'https://honorcart.com/reviewer-store/checkout',
    merchants,
    prior: first,
    now: 2000
  });
  assert.equal(second.state, STATES.PROTECTED_REFERRAL);
  assert.equal(second.monetizationEnabled, false);
});

test('carries a fresh referral marker through a tracking redirect to a supported merchant', () => {
  const tracking = nextAttributionState({
    rawUrl: 'https://tracking.example/click?clickid=creator-1',
    merchants,
    now: 1000
  });
  const landing = nextAttributionState({
    rawUrl: 'https://honorcart.com/reviewer-store',
    merchants,
    prior: tracking,
    now: 30_000
  });
  assert.equal(landing.state, STATES.PROTECTED_REFERRAL);
  assert.equal(landing.protectedMerchantId, 'review');
});

test('does not carry an expired pending referral to an unrelated merchant visit', () => {
  const tracking = nextAttributionState({
    rawUrl: 'https://tracking.example/click?clickid=creator-1',
    merchants,
    now: 1000
  });
  const landing = nextAttributionState({
    rawUrl: 'https://honorcart.com/reviewer-store',
    merchants,
    prior: tracking,
    now: 5 * 60 * 1000
  });
  assert.equal(landing.state, STATES.NO_REFERRAL);
});

test('matches the reviewer path but not the rest of the HonorCart site', () => {
  assert.equal(merchantFor('https://honorcart.com/reviewer-store', merchants).id, 'review');
  assert.equal(merchantFor('https://www.honorcart.com/reviewer-store/item', merchants).id, 'review');
  assert.equal(merchantFor('https://honorcart.com/privacy', merchants), undefined);
  assert.equal(merchantFor('https://honorcart.com.evil.example/reviewer-store', merchants), undefined);
});
