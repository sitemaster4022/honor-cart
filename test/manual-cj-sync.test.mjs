import test from 'node:test';
import assert from 'node:assert/strict';
import { handleManualCjSync } from '../src/lib/cj-sync-admin.ts';
import { CjSyncError } from '../src/lib/cj-link-search.ts';

const adminToken = 'local-test-admin-token';
const cjPat = 'local-test-cj-pat';

class FakeKv {
  values = new Map();
  puts = [];

  async get(key, type) {
    const value = this.values.get(key) ?? null;
    return type === 'json' && value ? JSON.parse(value) : value;
  }

  async put(key, value, options) {
    this.puts.push({ key, value, options });
    this.values.set(key, value);
  }
}

function env() {
  return { HONORCART_SYNC_ADMIN_TOKEN: adminToken, CJ_PAT: cjPat, OFFERS: new FakeKv() };
}

function request(token, body = { mode: 'incremental' }, method = 'POST') {
  return new Request('https://honorcart.com/api/admin/cj-sync', {
    method,
    headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
}

function successfulSync(calls) {
  return async (runtime, mode) => {
    calls.push(mode);
    const syncedAt = '2026-09-10T12:00:00.000Z';
    await runtime.OFFERS.put('snapshot:v1', JSON.stringify({ offers: [{ id: 'safe-offer' }], syncedAt, lastFullSyncAt: mode === 'full' ? syncedAt : null, mode }));
    return { offersFetched: 2, offersStored: 1, pagesFetched: 3, mode, syncedAt };
  };
}

test('missing auth returns 401 with no-store', async () => {
  const result = await handleManualCjSync(request(null), env());
  assert.equal(result.status, 401);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('wrong auth returns 401', async () => {
  const result = await handleManualCjSync(request('wrong-token'), env());
  assert.equal(result.status, 401);
});

test('unsupported mode returns 400', async () => {
  const result = await handleManualCjSync(request(adminToken, { mode: 'partial' }), env());
  assert.equal(result.status, 400);
  assert.equal((await result.json()).error.category, 'invalid_mode');
});

test('incremental mode calls the production sync dependency', async () => {
  const calls = [];
  const result = await handleManualCjSync(request(adminToken), env(), successfulSync(calls));
  assert.equal(result.status, 200);
  assert.deepEqual(calls, ['incremental']);
});

test('full mode calls the production sync dependency', async () => {
  const calls = [];
  const result = await handleManualCjSync(request(adminToken, { mode: 'full' }), env(), successfulSync(calls));
  assert.equal(result.status, 200);
  assert.deepEqual(calls, ['full']);
});

test('manual sync keeps a 30-second cooldown while using a KV-compatible storage TTL', async (t) => {
  const startedAt = 1_789_000_000_000;
  t.mock.method(Date, 'now', () => startedAt);
  const runtime = env();
  const result = await handleManualCjSync(request(adminToken), runtime, successfulSync([]));
  const rateLimitWrite = runtime.OFFERS.puts.find(({ key }) => key === 'admin:cj-sync:rate-limit:v1');

  assert.equal(result.status, 200);
  assert.ok(rateLimitWrite);
  assert.equal(Number(rateLimitWrite.value), startedAt + 30_000);
  assert.ok(rateLimitWrite.options.expirationTtl >= 60);
});

test('successful response is sanitized and confirms the public snapshot', async () => {
  const result = await handleManualCjSync(request(adminToken), env(), successfulSync([]));
  const text = await result.text();
  const body = JSON.parse(text);
  assert.equal(body.ok, true);
  assert.equal(body.offersFetched, 2);
  assert.equal(body.offersStored, 1);
  assert.equal(body.snapshot.exists, true);
  assert.equal(body.snapshot.lastSyncMode, 'incremental');
  assert.equal(text.includes(adminToken), false);
  assert.equal(text.includes(cjPat), false);
  assert.equal(text.includes('example.cj.com'), false);
});

test('failure response never leaks thrown secret text', async () => {
  const result = await handleManualCjSync(request(adminToken), env(), async () => {
    throw new Error(`tokens: ${adminToken} ${cjPat}`);
  });
  const text = await result.text();
  const body = JSON.parse(text);
  assert.equal(result.status, 502);
  assert.equal(body.error.category, 'unexpected_exception');
  assert.equal(text.includes(adminToken), false);
  assert.equal(text.includes(cjPat), false);
});

test('CJ authentication failures preserve a safe category and upstream status', async () => {
  const result = await handleManualCjSync(request(adminToken), env(), async () => {
    throw new CjSyncError('cj_unauthorized', 'CJ Link Search returned HTTP 401', 401);
  });
  const body = await result.json();
  assert.equal(result.status, 502);
  assert.equal(body.error.category, 'cj_unauthorized');
  assert.equal(body.error.upstreamStatus, 401);
});

test('non-POST methods return 405', async () => {
  const result = await handleManualCjSync(request(adminToken, {}, 'GET'), env());
  assert.equal(result.status, 405);
  assert.equal(result.headers.get('allow'), 'POST');
});
