import { json } from './api-response.ts';
import { findCjCouponMerchant, matchesReviewerStore, type CjCouponMerchant } from './merchant-config.ts';
import { isOfferActive, normalizeDomain, type NormalizedOffer } from './offers.ts';

interface OfferSnapshot {
  offers: NormalizedOffer[];
  syncedAt: string;
}

interface OffersKv {
  get<T>(key: string, type: 'json'): Promise<T | null>;
}

interface PublicCoupon {
  code: string;
  description: string;
  minimumSpend: number | null;
  eligibilityConfidence: NormalizedOffer['eligibilityConfidence'];
  source: 'cj';
}

const confidenceRank: Record<NormalizedOffer['eligibilityConfidence'], number> = {
  high: 3,
  medium: 2,
  low: 1
};

export const reviewerCoupon = {
  code: 'HONOR10',
  description: 'Reviewer-only simulated 10% saving — not redeemable',
  source: 'honorcart-review-environment'
} as const;

export async function handleCouponsRequest(url: URL, offersKv: OffersKv, now = new Date()): Promise<Response> {
  const hostname = url.searchParams.get('host') || '';
  const pathname = url.searchParams.get('path') || '/';
  if (hostname.length > 253 || pathname.length > 2_048 || !pathname.startsWith('/')) {
    return json({ error: 'invalid_request', coupons: [] }, 400);
  }

  if (matchesReviewerStore(hostname, pathname)) {
    return json({
      merchantId: 'honorcart-reviewer-store',
      coupons: [reviewerCoupon]
    });
  }

  const merchant = findCjCouponMerchant(hostname);
  if (!merchant) return json({ error: 'unsupported_merchant', coupons: [] }, 404);

  let snapshot: OfferSnapshot | null;
  try {
    snapshot = await offersKv.get<OfferSnapshot>('snapshot:v1', 'json');
  } catch {
    snapshot = null;
  }
  if (!snapshot) {
    return json(
      {
        error: 'offer_snapshot_unavailable',
        status: 'sync_pending',
        merchantId: merchant.id,
        coupons: []
      },
      503,
      { 'Retry-After': '300' }
    );
  }

  return json(
    {
      merchantId: merchant.id,
      coupons: selectLiveCoupons(snapshot.offers, merchant, now),
      syncedAt: snapshot.syncedAt
    },
    200,
    { 'Cache-Control': 'public, max-age=300' }
  );
}

export function selectLiveCoupons(
  offers: NormalizedOffer[],
  merchant: CjCouponMerchant,
  now = new Date()
): PublicCoupon[] {
  const selected = new Map<string, NormalizedOffer>();

  for (const offer of offers) {
    const offerDomain = offer.domain ? normalizeDomain(offer.domain) : null;
    const couponCode = offer.couponCode?.trim();
    if (
      !offerDomain ||
      !couponCode ||
      !merchant.domains.some((domain) => offerDomain === domain || offerDomain.endsWith(`.${domain}`)) ||
      !isOfferActive(offer, now)
    ) {
      continue;
    }

    const normalizedCode = couponCode.toUpperCase();
    const current = selected.get(normalizedCode);
    if (!current || isStrongerRepresentative(offer, current)) selected.set(normalizedCode, offer);
  }

  return [...selected.entries()].map(([code, offer]) => ({
    code,
    description: offer.description.trim(),
    minimumSpend: offer.minimumSpend,
    eligibilityConfidence: offer.eligibilityConfidence,
    source: 'cj'
  }));
}

function isStrongerRepresentative(candidate: NormalizedOffer, current: NormalizedOffer): boolean {
  const confidenceDifference =
    confidenceRank[candidate.eligibilityConfidence] - confidenceRank[current.eligibilityConfidence];
  if (confidenceDifference !== 0) return confidenceDifference > 0;

  const freshnessDifference = timestamp(candidate.sourceUpdatedAt) - timestamp(current.sourceUpdatedAt);
  if (freshnessDifference !== 0) return freshnessDifference > 0;

  const descriptionDifference = candidate.description.trim().length - current.description.trim().length;
  if (descriptionDifference !== 0) return descriptionDifference > 0;

  return candidate.id.localeCompare(current.id) < 0;
}

function timestamp(value: string | null): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}
