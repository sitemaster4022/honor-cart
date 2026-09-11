import { checkAdminAuthorization } from './admin-auth.ts';
import {
  buildMerchantInventoryReport,
  type OfferSnapshot
} from './merchant-inventory.ts';
import { normalizeDomain } from './offers.ts';

interface MerchantInventoryEnvironment {
  HONORCART_SYNC_ADMIN_TOKEN?: string;
  OFFERS: KVNamespace;
}

export async function handleMerchantInventoryRequest(
  request: Request,
  runtime: MerchantInventoryEnvironment,
  now = new Date()
): Promise<Response> {
  if (request.method !== 'GET') {
    return adminResponse(
      { ok: false, error: { category: 'method_not_allowed', message: 'Only GET is allowed' } },
      405,
      { Allow: 'GET' }
    );
  }

  const authorization = checkAdminAuthorization(request, runtime.HONORCART_SYNC_ADMIN_TOKEN);
  if (!authorization.ok) {
    return adminResponse(
      { ok: false, error: { category: authorization.category, message: authorization.message } },
      authorization.status,
      authorization.headers || {}
    );
  }

  const url = new URL(request.url);
  const rawDomain = url.searchParams.get('domain');
  const rawAdvertiserId = url.searchParams.get('advertiserId');
  const domain = rawDomain === null ? null : normalizeDomain(rawDomain);
  const advertiserId = rawAdvertiserId === null ? null : rawAdvertiserId.trim();

  if (rawDomain !== null && !domain) {
    return adminResponse({ ok: false, error: { category: 'invalid_domain', message: 'Domain filter is invalid' } }, 400);
  }
  if (rawAdvertiserId !== null && (!advertiserId || advertiserId.length > 128)) {
    return adminResponse(
      { ok: false, error: { category: 'invalid_advertiser_id', message: 'Advertiser ID filter is invalid' } },
      400
    );
  }

  let snapshot: OfferSnapshot | null;
  try {
    snapshot = await runtime.OFFERS.get<OfferSnapshot>('snapshot:v1', 'json');
  } catch {
    snapshot = null;
  }

  if (!snapshot || !Array.isArray(snapshot.offers) || typeof snapshot.syncedAt !== 'string') {
    return adminResponse(
      {
        ok: false,
        error: {
          category: 'offer_snapshot_unavailable',
          message: 'The CJ offer snapshot is unavailable or invalid'
        }
      },
      503,
      { 'Retry-After': '300' }
    );
  }

  return adminResponse(buildMerchantInventoryReport(snapshot, now, { domain, advertiserId }));
}

function adminResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    }
  });
}
