import { isOfferActive, normalizeCjOffer, type NormalizedOffer } from './offers.ts';
import { parseCjXml } from './cj-parser.ts';

const CJ_ENDPOINT = 'https://link-search.api.cj.com/v2/link-search';
const PID = '101876786';
const PROMOTION_TYPES = ['coupon', 'sale/discount', 'free shipping'] as const;
const PAGE_SIZE = 100;
const MAX_CALLS = 24;
const MAX_RESPONSE_BYTES = 2_000_000;
export const CJ_SNAPSHOT_KEY = 'snapshot:v1';

interface OfferSnapshot {
  offers: NormalizedOffer[];
  syncedAt: string;
  lastFullSyncAt: string | null;
  mode: 'full' | 'incremental';
}

export type CjSyncMode = 'full' | 'incremental';

export interface CjSyncResult {
  offersFetched: number;
  offersStored: number;
  pagesFetched: number;
  mode: CjSyncMode;
  syncedAt: string;
}

export type CjSyncErrorCategory =
  | 'missing_cj_pat'
  | 'cj_unauthorized'
  | 'cj_forbidden'
  | 'cj_rate_limited'
  | 'cj_http_error'
  | 'malformed_cj_response'
  | 'pagination_safety_failure'
  | 'kv_binding_failure'
  | 'parsing_normalization_failure'
  | 'unexpected_exception';

export class CjSyncError extends Error {
  readonly category: CjSyncErrorCategory;
  readonly upstreamStatus?: number;

  constructor(
    category: CjSyncErrorCategory,
    message: string,
    upstreamStatus?: number
  ) {
    super(message);
    this.name = 'CjSyncError';
    this.category = category;
    this.upstreamStatus = upstreamStatus;
  }
}

interface OffersEnvironment {
  CJ_PAT?: string;
  OFFERS: KVNamespace;
}

export async function syncCjOffers(env: OffersEnvironment, mode: CjSyncMode, now = new Date()): Promise<CjSyncResult> {
  if (!env.CJ_PAT) throw new CjSyncError('missing_cj_pat', 'CJ authentication is not configured');
  let previous: OfferSnapshot | null;
  try {
    previous = await env.OFFERS.get<OfferSnapshot>(CJ_SNAPSHOT_KEY, 'json');
  } catch {
    throw new CjSyncError('kv_binding_failure', 'Unable to read the offer snapshot');
  }
  const since = mode === 'incremental' && previous?.syncedAt ? cjDate(new Date(Date.parse(previous.syncedAt) - 24 * 60 * 60 * 1000)) : null;
  const fetched: NormalizedOffer[] = [];
  let calls = 0;

  for (const promotionType of PROMOTION_TYPES) {
    let promotionComplete = false;
    for (let page = 1; calls < MAX_CALLS; page += 1) {
      const url = new URL(CJ_ENDPOINT);
      url.searchParams.set('website-id', PID);
      url.searchParams.set('advertiser-ids', 'joined');
      url.searchParams.set('promotion-type', promotionType);
      url.searchParams.set('records-per-page', String(PAGE_SIZE));
      url.searchParams.set('page-number', String(page));
      if (since) url.searchParams.set('last-updated', since);
      let response: Response;
      try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${env.CJ_PAT}`, Accept: 'application/xml' } });
      } catch {
        throw new CjSyncError('cj_http_error', 'CJ Link Search request failed');
      }
      calls += 1;
      if (!response.ok) {
        const category = response.status === 401 ? 'cj_unauthorized' : response.status === 403 ? 'cj_forbidden' : response.status === 429 ? 'cj_rate_limited' : 'cj_http_error';
        throw new CjSyncError(category, `CJ Link Search returned HTTP ${response.status}`, response.status);
      }
      const size = Number(response.headers.get('content-length') || 0);
      if (size > MAX_RESPONSE_BYTES) throw new CjSyncError('malformed_cj_response', 'CJ response exceeded the safe size limit');
      let body: string;
      try {
        body = await response.text();
      } catch {
        throw new CjSyncError('malformed_cj_response', 'Unable to read the CJ response');
      }
      if (body.length > MAX_RESPONSE_BYTES || !/<cj-api\b/i.test(body) || !/<links\b/i.test(body)) {
        throw new CjSyncError('malformed_cj_response', 'CJ returned an unexpected response format');
      }
      let parsed: ReturnType<typeof parseCjXml>;
      try {
        parsed = parseCjXml(body);
      } catch {
        throw new CjSyncError('malformed_cj_response', 'Unable to parse the CJ response');
      }
      if (parsed.recordsReturned !== parsed.records.length || parsed.totalMatched < parsed.recordsReturned) {
        throw new CjSyncError('malformed_cj_response', 'CJ response counts were inconsistent');
      }
      try {
        fetched.push(...parsed.records.filter((record) => record.advertiserId && record.linkId).map((record) => normalizeCjOffer(record, now)));
      } catch {
        throw new CjSyncError('parsing_normalization_failure', 'Unable to normalize CJ offers');
      }
      if (parsed.recordsReturned < PAGE_SIZE || page * PAGE_SIZE >= parsed.totalMatched) {
        promotionComplete = true;
        break;
      }
    }
    // Never replace the stored snapshot with a silently truncated result set.
    if (!promotionComplete) throw new CjSyncError('pagination_safety_failure', 'CJ results exceeded the per-run page budget');
  }

  const merged = mode === 'full' ? new Map<string, NormalizedOffer>() : new Map((previous?.offers || []).map((offer) => [offer.id, offer]));
  for (const offer of fetched) merged.set(offer.id, offer);
  const offers = [...merged.values()].map((offer) => ({ ...offer, active: isOfferActive(offer, now) }));
  const snapshot: OfferSnapshot = {
    offers,
    syncedAt: now.toISOString(),
    lastFullSyncAt: mode === 'full' ? now.toISOString() : previous?.lastFullSyncAt || null,
    mode
  };
  try {
    await env.OFFERS.put(CJ_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    throw new CjSyncError('kv_binding_failure', 'Unable to store the offer snapshot');
  }
  console.log(JSON.stringify({ event: 'cj_offer_sync', mode, offers: offers.length, fetched: fetched.length, calls, syncedAt: snapshot.syncedAt }));
  return { offersFetched: fetched.length, offersStored: offers.length, pagesFetched: calls, mode, syncedAt: snapshot.syncedAt };
}

export function describeCjSyncError(error: unknown): { category: CjSyncErrorCategory; message: string; upstreamStatus?: number } {
  if (error instanceof CjSyncError) {
    return { category: error.category, message: error.message, ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}) };
  }
  return { category: 'unexpected_exception', message: 'Unexpected CJ sync failure' };
}

function cjDate(date: Date): string {
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

