import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleManualCjSync } from '../../../lib/cj-sync-admin';

export const prerender = false;

export const ALL: APIRoute = ({ request }) => handleManualCjSync(request, env);
