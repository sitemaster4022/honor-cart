import {
  CJ_SNAPSHOT_KEY,
  CjSyncError,
  describeCjSyncError,
  syncCjOffers,
  type CjSyncMode,
  type CjSyncResult
} from './cj-link-search.ts';
import type { NormalizedOffer } from './offers.ts';
import { checkAdminAuthorization } from './admin-auth.ts';

interface ManualSyncEnvironment {
  CJ_PAT?: string;
  HONORCART_SYNC_ADMIN_TOKEN?: string;
  OFFERS: KVNamespace;
}

interface OfferSnapshot {
  offers: NormalizedOffer[];
  syncedAt: string;
  lastFullSyncAt: string | null;
  mode: CjSyncMode;
}

type SyncFunction = (env: ManualSyncEnvironment, mode: CjSyncMode) => Promise<CjSyncResult>;

const RATE_LIMIT_KEY = 'admin:cj-sync:rate-limit:v1';
const RATE_LIMIT_SECONDS = 30;
const RATE_LIMIT_STORAGE_TTL_SECONDS = 60;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };

export async function handleManualCjSync(
  request: Request,
  env: ManualSyncEnvironment,
  runSync: SyncFunction = syncCjOffers
): Promise<Response> {
  if (request.method !== 'POST') {
    return response({ ok: false, error: { category: 'method_not_allowed', message: 'Only POST is allowed' } }, 405, { Allow: 'POST' });
  }

  const authorization = checkAdminAuthorization(request, env.HONORCART_SYNC_ADMIN_TOKEN);
  if (!authorization.ok) {
    return response(
      { ok: false, error: { category: authorization.category, message: authorization.message } },
      authorization.status,
      authorization.headers || {}
    );
  }

  let mode: CjSyncMode = 'incremental';
  const body = await request.text();
  if (body.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return response({ ok: false, error: { category: 'invalid_request', message: 'Request body must be valid JSON' } }, 400);
    }
    if (!parsed || typeof parsed !== 'object') return response({ ok: false, error: { category: 'invalid_request', message: 'Request body must be a JSON object' } }, 400);
    const requestedMode = (parsed as { mode?: unknown }).mode;
    if (requestedMode !== undefined && requestedMode !== 'incremental' && requestedMode !== 'full') {
      return response({ ok: false, error: { category: 'invalid_mode', message: 'Mode must be incremental or full' } }, 400);
    }
    if (requestedMode) mode = requestedMode;
  }

  const startedAt = Date.now();
  try {
    const limitedUntil = Number(await env.OFFERS.get(RATE_LIMIT_KEY));
    if (Number.isFinite(limitedUntil) && limitedUntil > startedAt) {
      const retryAfter = Math.max(1, Math.ceil((limitedUntil - startedAt) / 1000));
      return response({ ok: false, error: { category: 'rate_limited', message: 'A manual sync was triggered recently' }, retryAfter }, 429, { 'Retry-After': String(retryAfter) });
    }
    await env.OFFERS.put(RATE_LIMIT_KEY, String(startedAt + RATE_LIMIT_SECONDS * 1000), { expirationTtl: RATE_LIMIT_STORAGE_TTL_SECONDS });
  } catch {
    return syncFailure(new CjSyncError('kv_binding_failure', 'Unable to apply manual sync rate limiting'), mode, startedAt);
  }

  try {
    const result = await runSync(env, mode);
    let snapshot: OfferSnapshot | null;
    try {
      snapshot = await env.OFFERS.get<OfferSnapshot>(CJ_SNAPSHOT_KEY, 'json');
    } catch {
      throw new CjSyncError('kv_binding_failure', 'Unable to verify the stored offer snapshot');
    }
    if (!snapshot || snapshot.syncedAt !== result.syncedAt || !Array.isArray(snapshot.offers)) {
      throw new CjSyncError('kv_binding_failure', 'Stored offer snapshot verification failed');
    }
    return response({
      ok: true,
      mode,
      offersFetched: result.offersFetched,
      offersStored: snapshot.offers.length,
      pagesFetched: result.pagesFetched,
      syncedAt: snapshot.syncedAt,
      durationMs: Date.now() - startedAt,
      snapshot: {
        exists: true,
        lastSuccessfulSyncAt: snapshot.syncedAt,
        storedOffers: snapshot.offers.length,
        lastSyncMode: snapshot.mode
      }
    });
  } catch (error) {
    return syncFailure(error, mode, startedAt);
  }
}

function syncFailure(error: unknown, mode: CjSyncMode, startedAt: number): Response {
  const safe = describeCjSyncError(error);
  console.error(JSON.stringify({ event: 'cj_manual_sync_failed', mode, ...safe, durationMs: Date.now() - startedAt }));
  const status = safe.category === 'cj_rate_limited' ? 502 : safe.category === 'missing_cj_pat' || safe.category === 'kv_binding_failure' ? 503 : 502;
  return response({ ok: false, mode, error: safe, durationMs: Date.now() - startedAt }, status);
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...NO_STORE_HEADERS, ...headers } });
}
