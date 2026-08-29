import type { APIRoute } from 'astro';
import { json, options } from '../../lib/api-response';

export const prerender = false;
export const GET: APIRoute = () => json({
  version: '1.0',
  globalMonetizationEnabled: false,
  merchants: []
});
export const OPTIONS: APIRoute = () => options();
