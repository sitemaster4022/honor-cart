import { isOfferActive, normalizeCjOffer, type NormalizedOffer } from './offers';
import { parseCjXml } from './cj-parser';

const CJ_ENDPOINT = 'https://link-search.api.cj.com/v2/link-search';
const PID = '101876786';
const PROMOTION_TYPES = ['coupon', 'sale/discount', 'free shipping'] as const;
const PAGE_SIZE = 100;
const MAX_CALLS = 24;
const MAX_RESPONSE_BYTES = 2_000_000;

interface OfferSnapshot {
  offers: NormalizedOffer[];
  syncedAt: string;
  lastFullSyncAt: string | null;
  mode: 'full' | 'incremental';
}

interface OffersEnvironment {
  CJ_PAT?: string;
  OFFERS: KVNamespace;
}

export async function syncCjOffers(env: OffersEnvironment, mode: 'full' | 'incremental', now = new Date()): Promise<{ offers: number; calls: number; mode: string }> {
  if (!env.CJ_PAT) throw new Error('CJ_PAT is not configured');
  const previous = await env.OFFERS.get<OfferSnapshot>('snapshot:v1', 'json');
  const since = mode === 'incremental' && previous?.syncedAt ? cjDate(new Date(Date.parse(previous.syncedAt) - 24 * 60 * 60 * 1000)) : null;
  const fetched: NormalizedOffer[] = [];
  let calls = 0;

  for (const promotionType of PROMOTION_TYPES) {
    for (let page = 1; calls < MAX_CALLS; page += 1) {
      const url = new URL(CJ_ENDPOINT);
      url.searchParams.set('website-id', PID);
      url.searchParams.set('advertiser-ids', 'joined');
      url.searchParams.set('promotion-type', promotionType);
      url.searchParams.set('records-per-page', String(PAGE_SIZE));
      url.searchParams.set('page-number', String(page));
      if (since) url.searchParams.set('last-updated', since);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${env.CJ_PAT}`, Accept: 'application/xml' } });
      calls += 1;
      if (!response.ok) throw new Error(`CJ Link Search failed with status ${response.status}`);
      const size = Number(response.headers.get('content-length') || 0);
      if (size > MAX_RESPONSE_BYTES) throw new Error('CJ Link Search response exceeded the safe size limit');
      const parsed = parseCjXml(await response.text());
      fetched.push(...parsed.records.filter((record) => record.advertiserId && record.linkId).map((record) => normalizeCjOffer(record, now)));
      if (parsed.recordsReturned < PAGE_SIZE || page * PAGE_SIZE >= parsed.totalMatched) break;
    }
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
  await env.OFFERS.put('snapshot:v1', JSON.stringify(snapshot));
  console.log(JSON.stringify({ event: 'cj_offer_sync', mode, offers: offers.length, fetched: fetched.length, calls, syncedAt: snapshot.syncedAt }));
  return { offers: offers.length, calls, mode };
}

function cjDate(date: Date): string {
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

