export const globalMonetizationEnabled = false;

export const merchants = [
  {
    id: 'honorcart-reviewer-store',
    displayName: 'HonorCart Reviewer Store',
    domains: ['honorcart.com'],
    pathPrefixes: ['/reviewer-store'],
    couponSupport: true,
    monetizationApproved: false,
    affiliateNetwork: null
  },
  {
    id: 'unice',
    displayName: 'UNice',
    domains: ['unice.com'],
    pathPrefixes: [],
    couponSupport: true,
    monetizationApproved: false,
    affiliateNetwork: 'cj'
  }
] as const;

export function matchesReviewerStore(hostname: string, pathname: string) {
  const normalizedHost = hostname.toLowerCase().replace(/^www\./, '');
  const merchant = merchants[0];
  return merchant.domains.includes(normalizedHost as 'honorcart.com') &&
    merchant.pathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

