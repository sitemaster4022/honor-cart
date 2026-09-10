import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { options } from '../../lib/api-response';
import { handleCouponsRequest } from '../../lib/coupon-api';

export const prerender = false;
export const GET: APIRoute = ({ url }) => handleCouponsRequest(url, env.OFFERS);
export const OPTIONS: APIRoute = () => options();
