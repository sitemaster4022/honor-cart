import type { APIRoute } from 'astro';
import { json, options } from '../../lib/api-response';

export const prerender = false;
export const GET: APIRoute = () => json({ error: 'unsupported_merchant', coupons: [] }, 404);
export const OPTIONS: APIRoute = () => options();
