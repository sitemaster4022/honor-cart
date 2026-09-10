import { json } from './api-response.ts';
import { matchesReviewerStore, merchants } from './merchant-config.ts';
import { isOfferActive, normalizeDomain, type EligibilityConfidence, type NormalizedOffer } from './offers.ts';

const SNAPSHOT_KEY = 'snapshot:v1';

interface OfferSnapshot {
  offers: NormalizedOffer[];
  syncedAt: string;
}

interface SnapshotReader {
  get<T>(key: string, type: 'json'): Promise<T | null>;
}

interface PublicCoupon {
  code: string;
  description: string;
  minimumSpend: number | null;
  eligibilityConfidence: EligibilityConfidence;
  source: 'cj';
}

const confidenceRank: Record<EligibilityConfidence, number> = { high: 3, medium: 2, low: 1 };

export async function handleCouponLookup(url: URL, offersKv: SnapshotReader, now = new Date()): Promise<Response> {
  const hostname = url.searchParams.get('host') || '';
  const pathname = url.searchParams.get('path') || '/';
  if (hostname.length > 253 || pathname.length > 2_048 || !pathname.startsWith('/')) {
    return json({ error: 'invalid_request', coupons: [] }, 400);
  }

  if (matchesReviewerStore(hostname, pathname)) {
    return json({
      merchantId: 'honorcart-reviewer-store',
      coupons: [
        {
          code: 'HONOR10',
          description: 'Reviewer-only simulated 10% saving — not redeemable',
          source: 'honorcart-review-environment'
        }
      ]
    });
  }

  const requestedDomain = normalizeDomain(hostname);
  const merchant = requestedDomain
    ? merchants.find((candidate) =>
        candidate.id !== 'honorcart-reviewer-store' &&
        candidate.couponSupport &&
        candidate.domains.some((domain) => domainMatches(requestedDomain, domain))
      )
    : undefined;
  if (!merchant) return json({ error: 'unsupported_merchant', coupons: [] }, 404);

  let snapshot: OfferSnapshot | null;
  try {
    snapshot = await offersKv.get<OfferSnapshot>(SNAPSHOT_KEY, 'json');
  } catch {
    return temporarilyUnavailable(merchant.id);
  }
  if (!snapshot) return temporarilyUnavailable(merchant.id);

  const merchantDomains = merchant.domains as readonly string[];
  const eligibleOffers = snapshot.offers.filter((offer) =>
    Boolean(offer.couponCode?.trim()) &&
    Boolean(offer.domain && merchantDomains.some((domain) => domainMatches(offer.domain!, domain))) &&
    isOfferActive(offer, now)
  );
  const coupons = deduplicateCoupons(eligibleOffers);
  return json({ merchantId: merchant.id, coupons });
}

function temporarilyUnavailable(merchantId: string): Response {
  return json(
    { error: 'offers_temporarily_unavailable', merchantId, coupons: [] },
    503,
    { 'Retry-After': '300' }
  );
}

function domainMatches(hostname: string, merchantDomain: string): boolean {
  return hostname === merchantDomain || hostname.endsWith(`.${merchantDomain}`);
}

function deduplicateCoupons(offers: NormalizedOffer[]): PublicCoupon[] {
  const representatives = new Map<string, NormalizedOffer>();
  for (const offer of offers) {
    const code = offer.couponCode!.trim().toUpperCase();
    const existing = representatives.get(code);
    if (!existing || compareOffers(offer, existing) > 0) representatives.set(code, offer);
  }

  return [...representatives.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, offer]) => ({
      code,
      description: offer.description,
      minimumSpend: offer.minimumSpend,
      eligibilityConfidence: offer.eligibilityConfidence,
      source: offer.source
    }));
}

function compareOffers(left: NormalizedOffer, right: NormalizedOffer): number {
  const confidence = confidenceRank[left.eligibilityConfidence] - confidenceRank[right.eligibilityConfidence];
  if (confidence) return confidence;
  const sourceFreshness = timestamp(left.sourceUpdatedAt) - timestamp(right.sourceUpdatedAt);
  if (sourceFreshness) return sourceFreshness;
  const usefulness = descriptionScore(left.description) - descriptionScore(right.description);
  if (usefulness) return usefulness;
  return right.id.localeCompare(left.id);
}

function timestamp(value: string | null): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function descriptionScore(description: string): number {
  const text = description.trim();
  const details = [/%|\$\s*\d/.test(text), /\b(?:off|save|free|bogo)\b/i.test(text), /\bcode\b/i.test(text)]
    .filter(Boolean).length;
  return details * 1_000 + Math.min(text.length, 500);
}
