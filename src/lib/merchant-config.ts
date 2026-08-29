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
  }
] as const;

export function matchesReviewerStore(hostname: string, pathname: string) {
  const normalizedHost = hostname.toLowerCase().replace(/^www\./, '');
  return merchants.some((merchant) =>
    merchant.domains.includes(normalizedHost as 'honorcart.com') &&
    merchant.pathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}
