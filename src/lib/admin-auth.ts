export type AdminAuthorization =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 503;
      category: 'unauthorized' | 'admin_auth_not_configured';
      message: string;
      headers?: Record<string, string>;
    };

export function checkAdminAuthorization(request: Request, configuredToken?: string): AdminAuthorization {
  if (!configuredToken) {
    return {
      ok: false,
      status: 503,
      category: 'admin_auth_not_configured',
      message: 'Admin authentication is not configured'
    };
  }

  const suppliedToken = bearerToken(request.headers.get('Authorization'));
  if (!suppliedToken || !constantTimeEqual(suppliedToken, configuredToken)) {
    return {
      ok: false,
      status: 401,
      category: 'unauthorized',
      message: 'Invalid or missing bearer token',
      headers: { 'WWW-Authenticate': 'Bearer' }
    };
  }

  return { ok: true };
}

function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1].trim() || null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] || 0) ^ (b[index] || 0);
  return mismatch === 0;
}
