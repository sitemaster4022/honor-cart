import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleMerchantInventoryRequest } from '../../../lib/merchant-inventory-admin';

export const prerender = false;

export const GET: APIRoute = ({ request }) => handleMerchantInventoryRequest(request, env);
