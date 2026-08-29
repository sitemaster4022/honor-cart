import type { APIRoute } from 'astro';
import { json, options } from '../../lib/api-response';
import { globalMonetizationEnabled, merchants } from '../../lib/merchant-config';

export const prerender = false;
export const GET: APIRoute = () => json({
  version: '1.2',
  globalMonetizationEnabled,
  merchants
});
export const OPTIONS: APIRoute = () => options();
