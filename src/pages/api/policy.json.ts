import type {APIRoute} from 'astro';
export const prerender=false;
export const GET:APIRoute=()=>new Response(JSON.stringify({version:'1.0',mode:'pre_telemetry',globalMonetizationEnabled:false,defaultAction:'stand_down',reason:'No production policy store is connected.'}),{headers:{'content-type':'application/json','cache-control':'public, max-age=60'}});

