import {
  findCjCouponMerchant,
  merchants,
  type CjCouponMerchant
} from './merchant-config.ts';
import {
  isOfferActive,
  normalizeDomain,
  type EligibilityConfidence,
  type NormalizedOffer
} from './offers.ts';
import {
  getMerchantReadiness,
  type MerchantReadinessStage
} from './merchant-readiness.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECOMMENDATION_EXCLUDED_STAGES: ReadonlySet<MerchantReadinessStage> = new Set([
  'live_validated',
  'enabled'
]);

export type SourceFreshness = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface OfferSnapshot {
  offers: NormalizedOffer[];
  syncedAt: string;
  lastFullSyncAt?: string | null;
  mode?: 'full' | 'incremental';
}

export interface MerchantInventoryFilters {
  domain?: string | null;
  advertiserId?: string | null;
}

export interface MerchantInventoryRecord {
  advertiserId: string;
  merchantName: string;
  primaryDomain: string | null;
  domains: string[];
  activeDomains: string[];
  domainStatus: 'resolved' | 'domain_unresolved';
  totalSnapshotRecords: number;
  currentlyActiveRecords: number;
  codedRecords: number;
  totalSnapshotCodedRecords: number;
  uniqueCouponCodeCount: number;
  uniqueCouponCodes: string[];
  uncodedPromotionCount: number;
  highConfidenceCodedCount: number;
  mediumConfidenceCodedCount: number;
  lowConfidenceCodedCount: number;
  mostRecentCjSourceUpdate: string | null;
  oldestCjSourceUpdate: string | null;
  mostRecentCodedSourceUpdate: string | null;
  oldestCodedSourceUpdate: string | null;
  codedInventoryFreshness: SourceFreshness;
  codedInventoryAgeDays: number | null;
  sourceFreshness: {
    mostRecentAgeDays: number | null;
    oldestAgeDays: number | null;
    codedMostRecentAgeDays: number | null;
    codedOldestAgeDays: number | null;
  };
  merchantConfigId: string | null;
  inMerchantConfig: boolean;
  couponSupportEnabled: boolean;
  affiliateNetwork: string | null;
  readinessStage: MerchantReadinessStage;
  readinessSource: 'registry' | 'default';
  recommendationEligible: boolean;
  recommendationRank: number | null;
  recommendationExclusionReason: string | null;
}

export interface MerchantInventorySummary {
  merchantCount: number;
  merchantsWithResolvedDomains: number;
  merchantsWithAtLeastOneCouponCode: number;
  totalSnapshotRecords: number;
  totalActiveOfferRecords: number;
  totalCodedOfferRecords: number;
  totalUniqueMerchantCouponCodes: number;
  liveValidatedMerchantCount: number;
  enabledMerchantCount: number;
}

export interface MerchantInventoryReport {
  snapshotSyncedAt: string;
  summary: MerchantInventorySummary;
  ranking: {
    method: 'lexicographic';
    priority: string[];
    excludedReadinessStages: MerchantReadinessStage[];
  };
  filters: {
    domain: string | null;
    advertiserId: string | null;
  };
  recommendedNextMerchants: MerchantInventoryRecord[];
  merchants: MerchantInventoryRecord[];
}

export function normalizeCouponCode(value: string | null): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

export function buildMerchantInventoryReport(
  snapshot: OfferSnapshot,
  now = new Date(),
  filters: MerchantInventoryFilters = {}
): MerchantInventoryReport {
  const grouped = new Map<string, NormalizedOffer[]>();

  for (const offer of snapshot.offers) {
    const advertiserId = offer.advertiserId.trim() || 'unknown';
    const records = grouped.get(advertiserId) || [];
    records.push(offer);
    grouped.set(advertiserId, records);
  }

  const allRecords = [...grouped.entries()]
    .map(([advertiserId, records]) => buildMerchantRecord(advertiserId, records, now))
    .filter((merchant) => matchesFilters(merchant, filters));

  const candidates = allRecords
    .filter((merchant) => merchant.recommendationEligible)
    .sort(compareRecommendation)
    .map((merchant, index) => ({ ...merchant, recommendationRank: index + 1 }));

  const excluded = allRecords
    .filter((merchant) => !merchant.recommendationEligible)
    .sort((left, right) => left.advertiserId.localeCompare(right.advertiserId))
    .map((merchant) => ({ ...merchant, recommendationRank: null }));

  const orderedMerchants = [...candidates, ...excluded];
  const summary: MerchantInventorySummary = {
    merchantCount: orderedMerchants.length,
    merchantsWithResolvedDomains: orderedMerchants.filter((merchant) => merchant.primaryDomain !== null).length,
    merchantsWithAtLeastOneCouponCode: orderedMerchants.filter((merchant) => merchant.uniqueCouponCodeCount > 0).length,
    totalSnapshotRecords: sum(orderedMerchants, (merchant) => merchant.totalSnapshotRecords),
    totalActiveOfferRecords: sum(orderedMerchants, (merchant) => merchant.currentlyActiveRecords),
    totalCodedOfferRecords: sum(orderedMerchants, (merchant) => merchant.codedRecords),
    totalUniqueMerchantCouponCodes: sum(orderedMerchants, (merchant) => merchant.uniqueCouponCodeCount),
    liveValidatedMerchantCount: orderedMerchants.filter((merchant) => merchant.readinessStage === 'live_validated').length,
    enabledMerchantCount: orderedMerchants.filter((merchant) => merchant.readinessStage === 'enabled').length
  };

  return {
    snapshotSyncedAt: snapshot.syncedAt,
    summary,
    ranking: {
      method: 'lexicographic',
      priority: [
        'uniqueCouponCodeCount descending',
        'highConfidenceCodedCount descending',
        'mediumConfidenceCodedCount descending',
        'mostRecentCodedSourceUpdate descending',
        'resolved primaryDomain first',
        'advertiserId ascending as final tie-breaker'
      ],
      excludedReadinessStages: [...RECOMMENDATION_EXCLUDED_STAGES]
    },
    filters: {
      domain: normalizeDomain(filters.domain || '') || null,
      advertiserId: filters.advertiserId?.trim() || null
    },
    recommendedNextMerchants: candidates.slice(0, 10),
    merchants: orderedMerchants
  };
}

function buildMerchantRecord(
  advertiserId: string,
  records: NormalizedOffer[],
  now: Date
): MerchantInventoryRecord {
  const readiness = getMerchantReadiness(advertiserId);
  const activeRecords = records.filter((offer) => isOfferActive(offer, now));
  const codedRecords = activeRecords.filter((offer) => normalizeCouponCode(offer.couponCode) !== null);
  const allCodedRecords = records.filter((offer) => normalizeCouponCode(offer.couponCode) !== null);
  const uniqueCouponCodes = [...new Set(codedRecords.map((offer) => normalizeCouponCode(offer.couponCode) as string))].sort((left, right) => left.localeCompare(right));
  const confidenceCounts = countConfidence(codedRecords);
  const allSourceRange = sourceRange(records);
  const codedSourceRange = sourceRange(codedRecords);
  const domains = uniqueDomains(records);
  const activeDomains = uniqueDomains(activeRecords);
  const primaryDomain = choosePrimaryDomain(activeDomains);
  const configuredMerchant = findConfiguredMerchant(advertiserId, domains, readiness.domains);
  const recommendationEligible = !RECOMMENDATION_EXCLUDED_STAGES.has(readiness.stage);

  return {
    advertiserId,
    merchantName: chooseMerchantName(records, advertiserId),
    primaryDomain,
    domains,
    activeDomains,
    domainStatus: primaryDomain ? 'resolved' : 'domain_unresolved',
    totalSnapshotRecords: records.length,
    currentlyActiveRecords: activeRecords.length,
    codedRecords: codedRecords.length,
    totalSnapshotCodedRecords: allCodedRecords.length,
    uniqueCouponCodeCount: uniqueCouponCodes.length,
    uniqueCouponCodes,
    uncodedPromotionCount: Math.max(0, activeRecords.length - codedRecords.length),
    highConfidenceCodedCount: confidenceCounts.high,
    mediumConfidenceCodedCount: confidenceCounts.medium,
    lowConfidenceCodedCount: confidenceCounts.low,
    mostRecentCjSourceUpdate: allSourceRange.mostRecent,
    oldestCjSourceUpdate: allSourceRange.oldest,
    mostRecentCodedSourceUpdate: codedSourceRange.mostRecent,
    oldestCodedSourceUpdate: codedSourceRange.oldest,
    codedInventoryFreshness: freshnessBand(codedSourceRange.mostRecent, now),
    codedInventoryAgeDays: ageDays(codedSourceRange.mostRecent, now),
    sourceFreshness: {
      mostRecentAgeDays: ageDays(allSourceRange.mostRecent, now),
      oldestAgeDays: ageDays(allSourceRange.oldest, now),
      codedMostRecentAgeDays: ageDays(codedSourceRange.mostRecent, now),
      codedOldestAgeDays: ageDays(codedSourceRange.oldest, now)
    },
    merchantConfigId: configuredMerchant?.id || null,
    inMerchantConfig: Boolean(configuredMerchant),
    couponSupportEnabled: configuredMerchant?.couponSupport || false,
    affiliateNetwork: configuredMerchant?.affiliateNetwork || 'cj',
    readinessStage: readiness.stage,
    readinessSource: readiness.source,
    recommendationEligible,
    recommendationRank: null,
    recommendationExclusionReason: recommendationEligible
      ? null
      : 'readiness_stage_excluded'
  };
}

function chooseMerchantName(records: NormalizedOffer[], advertiserId: string): string {
  const counts = new Map<string, number>();
  for (const record of records) {
    const name = record.merchantName.trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }

  const winner = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  )[0]?.[0];
  return winner || 'CJ advertiser ' + advertiserId;
}

function uniqueDomains(records: NormalizedOffer[]): string[] {
  return [...new Set(
    records
      .map((offer) => normalizeDomain(typeof offer.domain === 'string' ? offer.domain : ''))
      .filter((domain): domain is string => Boolean(domain))
  )].sort((left, right) => left.localeCompare(right));
}

function choosePrimaryDomain(activeDomains: string[]): string | null {
  if (activeDomains.length === 0) return null;
  const counts = new Map<string, number>();
  for (const domain of activeDomains) counts.set(domain, (counts.get(domain) || 0) + 1);

  const candidates = activeDomains.filter(
    (domain) => !activeDomains.some((other) => other !== domain && domain.endsWith('.' + other))
  );

  return [...new Set(candidates)].sort((left, right) => {
    const countDifference = (counts.get(right) || 0) - (counts.get(left) || 0);
    if (countDifference !== 0) return countDifference;
    const labelDifference = left.split('.').length - right.split('.').length;
    if (labelDifference !== 0) return labelDifference;
    return left.localeCompare(right);
  })[0] || null;
}

function findConfiguredMerchant(
  advertiserId: string,
  domains: string[],
  readinessDomains: readonly string[]
): CjCouponMerchant | undefined {
  const direct = merchants.find(
    (merchant) => merchant.affiliateNetwork === 'cj' && merchant.advertiserId === advertiserId
  );
  if (direct) return direct;

  for (const domain of [...domains, ...readinessDomains]) {
    const candidate = findCjCouponMerchant(domain);
    if (candidate && (!candidate.advertiserId || candidate.advertiserId === advertiserId)) return candidate;
  }
  return undefined;
}

function countConfidence(offers: NormalizedOffer[]): Record<EligibilityConfidence, number> {
  return offers.reduce(
    (counts, offer) => {
      counts[offer.eligibilityConfidence] += 1;
      return counts;
    },
    { high: 0, medium: 0, low: 0 }
  );
}

function sourceRange(offers: NormalizedOffer[]): { mostRecent: string | null; oldest: string | null } {
  const values = offers
    .map((offer) => {
      const timestamp = parseTimestamp(offer.sourceUpdatedAt);
      return timestamp === null ? null : { value: offer.sourceUpdatedAt as string, timestamp };
    })
    .filter((value): value is { value: string; timestamp: number } => value !== null);

  if (values.length === 0) return { mostRecent: null, oldest: null };
  const mostRecent = values.reduce((current, value) => value.timestamp > current.timestamp ? value : current);
  const oldest = values.reduce((current, value) => value.timestamp < current.timestamp ? value : current);
  return { mostRecent: mostRecent.value, oldest: oldest.value };
}

function freshnessBand(value: string | null, now: Date): SourceFreshness {
  const age = ageDays(value, now);
  if (age === null) return 'unknown';
  if (age <= 14) return 'fresh';
  if (age <= 90) return 'aging';
  return 'stale';
}

function ageDays(value: string | null, now: Date): number | null {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) return null;
  return Math.max(0, Math.round(((now.getTime() - timestamp) / DAY_MS) * 10) / 10);
}

function timestampOrNegativeInfinity(value: string | null): number {
  return parseTimestamp(value) ?? Number.NEGATIVE_INFINITY;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function matchesFilters(merchant: MerchantInventoryRecord, filters: MerchantInventoryFilters): boolean {
  const advertiserId = filters.advertiserId?.trim();
  if (advertiserId && merchant.advertiserId !== advertiserId) return false;

  const domain = normalizeDomain(filters.domain || '');
  if (!domain) return true;
  return merchant.domains.some((observed) => observed === domain || observed.endsWith('.' + domain));
}

function compareRecommendation(left: MerchantInventoryRecord, right: MerchantInventoryRecord): number {
  const uniqueCodeDifference = right.uniqueCouponCodeCount - left.uniqueCouponCodeCount;
  if (uniqueCodeDifference !== 0) return uniqueCodeDifference;

  const highConfidenceDifference = right.highConfidenceCodedCount - left.highConfidenceCodedCount;
  if (highConfidenceDifference !== 0) return highConfidenceDifference;

  const mediumConfidenceDifference = right.mediumConfidenceCodedCount - left.mediumConfidenceCodedCount;
  if (mediumConfidenceDifference !== 0) return mediumConfidenceDifference;

  const freshnessDifference =
    timestampOrNegativeInfinity(right.mostRecentCodedSourceUpdate) -
    timestampOrNegativeInfinity(left.mostRecentCodedSourceUpdate);
  if (freshnessDifference !== 0) return freshnessDifference;

  const domainDifference =
    Number(right.primaryDomain !== null) - Number(left.primaryDomain !== null);
  if (domainDifference !== 0) return domainDifference;

  return left.advertiserId.localeCompare(right.advertiserId);
}

function sum(records: MerchantInventoryRecord[], selector: (record: MerchantInventoryRecord) => number): number {
  return records.reduce((total, record) => total + selector(record), 0);
}
