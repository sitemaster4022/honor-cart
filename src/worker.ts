import { handle } from '@astrojs/cloudflare/handler';
import { syncCjOffers } from './lib/cj-link-search';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
  async scheduled(controller, env) {
    const mode = controller.cron === '15 3 * * SUN' ? 'full' : 'incremental';
    try {
      await syncCjOffers(env, mode);
    } catch (error) {
      console.error(JSON.stringify({ event: 'cj_offer_sync_failed', mode, message: error instanceof Error ? error.message : 'Unknown error' }));
      throw error;
    }
  }
} satisfies ExportedHandler<Env>;

