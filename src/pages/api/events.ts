import type {APIRoute} from 'astro';
export const prerender=false;
export const POST:APIRoute=()=>new Response(JSON.stringify({error:'telemetry_not_configured',message:'Protected-referral ingestion remains disabled until authentication, D1, and production privacy controls are configured.'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});

