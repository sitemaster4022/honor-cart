import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json, options } from '../../lib/api-response';
import { isOfferActive, normalizeDomain, publicOffer, type NormalizedOffer } from '../../lib/offers';

export const prerender = false;

interface OfferSnapshot { offers: NormalizedOffer[]; syncedAt: string; }

export const GET: APIRoute = async ({ url }) => {
  const domain = normalizeDomain(url.searchParams.get('domain') || '');
  if (!domain) return json({ error: 'invalid_domain', offers: [] }, 400);
  const snapshot = await env.OFFERS.get<OfferSnapshot>('snapshot:v1', 'json');
  if (!snapshot) return json({ domain, offers: [], status: 'sync_pending' }, 503, { 'Retry-After': '300' });
  const offers = snapshot.offers
    .filter((offer) => offer.domain && (domain === offer.domain || domain.endsWith(`.${offer.domain}`)) && isOfferActive(offer))
    .map(publicOffer);
  return json({ domain, offers, syncedAt: snapshot.syncedAt }, 200, { 'Cache-Control': 'public, max-age=300' });
};

export const OPTIONS: APIRoute = () => options();

