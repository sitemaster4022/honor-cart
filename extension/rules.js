(function attachHonorCartRules(scope) {
  const STATES = Object.freeze({
    NO_REFERRAL: 'NO_REFERRAL',
    PROTECTED_REFERRAL: 'PROTECTED_REFERRAL',
    OUR_ACTIVATION: 'OUR_ACTIVATION'
  });
  const PENDING_REFERRAL_TTL_MS = 2 * 60 * 1000;
  const REFERRAL_PARAMS = new Set([
    'aff', 'affiliate', 'affiliate_id', 'affid', 'aff_id', 'clickid', 'click_id',
    'irclickid', 'ranmid', 'ransiteid', 'utm_affiliate', 'afsrc'
  ]);

  function hasReferralSignal(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return [...url.searchParams.keys()].some((key) => REFERRAL_PARAMS.has(key.toLowerCase()));
    } catch { return false; }
  }

  function merchantFor(rawUrl, merchants) {
    let url;
    try { url = new URL(rawUrl); } catch { return undefined; }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return merchants.find((merchant) => {
      const domainMatch = merchant.domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
      if (!domainMatch) return false;
      if (!merchant.pathPrefixes?.length) return true;
      return merchant.pathPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
    });
  }

  function normalizedHostname(hostname) {
    return String(hostname || '').toLowerCase().replace(/^www\./, '');
  }

  function sameMerchantSession(prior, merchant, hostname) {
    if (merchant && prior.merchant?.id === merchant.id) return true;
    return normalizedHostname(prior.hostname) === normalizedHostname(hostname);
  }

  function nextAttributionState({
    rawUrl,
    merchants = [],
    globalMonetizationEnabled = false,
    prior = null,
    now = Date.now()
  }) {
    let url;
    try { url = new URL(rawUrl); } catch { return prior; }
    const merchant = merchantFor(rawUrl, merchants) || null;
    const monetizationEnabled = Boolean(globalMonetizationEnabled && merchant?.monetizationApproved);

    if (hasReferralSignal(rawUrl)) {
      return {
        state: STATES.PROTECTED_REFERRAL,
        reason: 'Existing affiliate referral detected; monetization is blocked',
        hostname: url.hostname,
        merchant,
        monetizationEnabled: false,
        detectedAt: now,
        pendingReferral: !merchant,
        protectedMerchantId: merchant?.id || null
      };
    }

    if (prior?.state === STATES.PROTECTED_REFERRAL) {
      const pendingReferral = prior.pendingReferral === true &&
        Boolean(merchant) &&
        now - Number(prior.detectedAt || 0) <= PENDING_REFERRAL_TTL_MS;
      const protectedMerchant = Boolean(merchant && prior.protectedMerchantId === merchant.id);
      if (sameMerchantSession(prior, merchant, url.hostname) || pendingReferral || protectedMerchant) {
        return {
          ...prior,
          hostname: url.hostname,
          merchant,
          monetizationEnabled: false,
          pendingReferral: merchant ? false : prior.pendingReferral,
          protectedMerchantId: merchant?.id || prior.protectedMerchantId || null
        };
      }
    }

    if (prior?.state === STATES.OUR_ACTIVATION && sameMerchantSession(prior, merchant, url.hostname)) {
      return { ...prior, hostname: url.hostname, merchant, monetizationEnabled };
    }

    return {
      state: STATES.NO_REFERRAL,
      reason: 'No referral signal detected',
      hostname: url.hostname,
      merchant,
      monetizationEnabled
    };
  }

  const api = Object.freeze({
    STATES,
    PENDING_REFERRAL_TTL_MS,
    hasReferralSignal,
    merchantFor,
    nextAttributionState
  });
  scope.HonorCartRules = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
