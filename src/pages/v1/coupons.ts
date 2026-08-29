import type { APIRoute } from 'astro';
import { json, options } from '../../lib/api-response';
import { matchesReviewerStore } from '../../lib/merchant-config';

export const prerender = false;
export const GET: APIRoute = ({ url }) => {
  const hostname = url.searchParams.get('host') || '';
  const pathname = url.searchParams.get('path') || '/';
  if (!matchesReviewerStore(hostname, pathname)) {
    return json({ error: 'unsupported_merchant', coupons: [] }, 404);
  }
  return json({
    merchantId: 'honorcart-reviewer-store',
    coupons: [
      {
        code: 'HONOR10',
        description: 'Reviewer-only simulated 10% saving — not redeemable',
        source: 'honorcart-review-environment'
      }
    ]
  });
};
export const OPTIONS: APIRoute = () => options();
