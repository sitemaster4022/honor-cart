import type { APIRoute } from 'astro';
import { json, options } from '../../lib/api-response';

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > 16_384) return json({ error: 'request_too_large' }, 413);
  try {
    await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  return json({ error: 'monetization_disabled' }, 403);
};
export const OPTIONS: APIRoute = () => options();
