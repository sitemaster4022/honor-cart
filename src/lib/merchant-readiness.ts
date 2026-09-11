export const MERCHANT_READINESS_STAGES = [
  'inventory_only',
  'checkout_inspected',
  'adapter_built',
  'automated_tests_passed',
  'live_validated',
  'enabled'
] as const;

export type MerchantReadinessStage = (typeof MERCHANT_READINESS_STAGES)[number];

export interface MerchantReadinessEntry {
  advertiserId: string;
  merchantId: string;
  domains: readonly string[];
  stage: MerchantReadinessStage;
  notes: string;
}

export interface MerchantReadinessStatus {
  stage: MerchantReadinessStage;
  source: 'registry' | 'default';
  merchantId: string | null;
  domains: readonly string[];
  notes: string | null;
}

// Keep this registry intentionally small. Merchants absent from it are derived
// from the CJ snapshot and remain inventory_only until explicitly progressed.
export const merchantReadinessRegistry: readonly MerchantReadinessEntry[] = [
  {
    advertiserId: '5824323',
    merchantId: 'unice',
    domains: ['unice.com'],
    stage: 'live_validated',
    notes: 'UNice has passed the current extension and checkout validation sequence.'
  }
];

export function getMerchantReadiness(advertiserId: string): MerchantReadinessStatus {
  const entry = merchantReadinessRegistry.find((candidate) => candidate.advertiserId === advertiserId);
  if (!entry) {
    return {
      stage: 'inventory_only',
      source: 'default',
      merchantId: null,
      domains: [],
      notes: null
    };
  }

  return {
    stage: entry.stage,
    source: 'registry',
    merchantId: entry.merchantId,
    domains: entry.domains,
    notes: entry.notes
  };
}
