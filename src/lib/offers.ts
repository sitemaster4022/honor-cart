export type EligibilityConfidence = 'high' | 'medium' | 'low';

export interface CjLinkRecord {
  advertiserId: string;
  advertiserName: string;
  linkId: string;
  linkName: string;
  description: string;
  promotionType: string;
  promotionStartDate: string;
  promotionEndDate: string;
  couponCode: string;
  destination: string;
  clickUrl: string;
  category: string;
  lastUpdated: string;
}

export interface NormalizedOffer {
  id: string;
  advertiserId: string;
  merchantName: string;
  domain: string | null;
  couponCode: string | null;
  description: string;
  promotionType: string;
  minimumSpend: number | null;
  currency: 'USD' | null;
  startDate: string | null;
  endDate: string | null;
  destinationUrl: string | null;
  cjTrackingUrl: string | null;
  source: 'cj';
  sourceUpdatedAt: string | null;
  lastUpdatedAt: string;
  eligibilityConfidence: EligibilityConfidence;
  requiresLiveVerification: boolean;
  freeGift: { present: boolean; description: string | null };
  active: boolean;
}

const AMBIGUOUS = /\b(up to|select(?:ed)?|eligible|qualifying|exclusions?|category|categories|product|styles?|members?|new customers?|first order|bundle|bogo|buy\s+\d+|gift)\b/i;
const FREE_GIFT = /\b(free\s+(?:gift|item|product|wig|bundle)|gift\s+with\s+purchase|bogo|buy\s+\d+\s+get\s+\d+)\b/i;

export function normalizeDomain(value: string): string | null {
  const candidate = value.trim().toLowerCase();
  if (!candidate || candidate.length > 253) return null;
  try {
    const url = candidate.includes('://') ? new URL(candidate) : new URL(`https://${candidate}`);
    const host = url.hostname.replace(/^www\./, '').replace(/\.$/, '');
    return /^[a-z0-9.-]+$/.test(host) && host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

export function parseMinimumSpend(text: string): number | null {
  const patterns = [
    /(?:minimum|min\.?|orders?|purchase|spend)\s*(?:of|over|above|at least|:)??\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i,
    /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:minimum|min\.?|or more|purchase|order)/i,
    /(?:spend|orders? over|purchase over)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1].replace(/,/g, ''));
    if (Number.isFinite(value) && value >= 0 && value <= 1_000_000) return value;
  }
  return null;
}

export function parseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^(?:n\/a|null|ongoing)$/i.test(trimmed)) return null;
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function isOfferActive(offer: Pick<NormalizedOffer, 'startDate' | 'endDate' | 'lastUpdatedAt'>, now = new Date()): boolean {
  const current = now.getTime();
  if (offer.startDate && Date.parse(offer.startDate) > current) return false;
  if (offer.endDate && Date.parse(offer.endDate) < current) return false;
  // Undated offers must be observed by a successful sync at least every 14 days.
  if (!offer.endDate && current - Date.parse(offer.lastUpdatedAt) > 14 * 24 * 60 * 60 * 1000) return false;
  return true;
}

export function normalizeCjOffer(record: CjLinkRecord, syncedAt: Date): NormalizedOffer {
  const description = [record.linkName, record.description].filter(Boolean).join(' — ').trim();
  const destinationUrl = safeHttpUrl(record.destination);
  const trackingUrl = safeHttpUrl(record.clickUrl);
  const minimumSpend = parseMinimumSpend(description);
  const freeGiftPresent = FREE_GIFT.test(description);
  const ambiguous = AMBIGUOUS.test(description);
  const offer: NormalizedOffer = {
    id: `cj:${record.advertiserId}:${record.linkId}`,
    advertiserId: record.advertiserId,
    merchantName: record.advertiserName,
    domain: destinationUrl ? normalizeDomain(destinationUrl) : null,
    couponCode: record.couponCode.trim() || null,
    description,
    promotionType: record.promotionType.trim().toLowerCase() || 'unknown',
    minimumSpend,
    currency: minimumSpend === null ? null : 'USD',
    startDate: parseDate(record.promotionStartDate),
    endDate: parseDate(record.promotionEndDate),
    destinationUrl,
    cjTrackingUrl: trackingUrl,
    source: 'cj',
    sourceUpdatedAt: parseDate(record.lastUpdated),
    lastUpdatedAt: syncedAt.toISOString(),
    eligibilityConfidence: ambiguous ? 'low' : minimumSpend !== null ? 'medium' : 'high',
    requiresLiveVerification: true,
    freeGift: { present: freeGiftPresent, description: freeGiftPresent ? description : null },
    active: true
  };
  offer.active = isOfferActive(offer, syncedAt);
  return offer;
}

export function publicOffer(offer: NormalizedOffer) {
  const { cjTrackingUrl: _privateAttributionLink, ...sanitized } = offer;
  return sanitized;
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

