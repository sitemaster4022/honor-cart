importScripts('config.js', 'rules.js');
const API_BASE = globalThis.HONORCART_CONFIG.apiBase;
const { STATES, nextAttributionState } = globalThis.HonorCartRules;

function storageKey(tabId) { return `tab:${tabId}`; }

async function getTabState(tabId) {
  const key = storageKey(tabId);
  return (await chrome.storage.session.get(key))[key] || {
    state: STATES.NO_REFERRAL,
    reason: 'No referral signal detected',
    hostname: null,
    merchant: null,
    monetizationEnabled: false
  };
}

async function setTabState(tabId, state) {
  await chrome.storage.session.set({ [storageKey(tabId)]: state });
}

async function fetchConfig() {
  const response = await fetch(`${API_BASE}/v1/config`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Configuration unavailable');
  return response.json();
}

async function hasConsent() {
  return (await chrome.storage.local.get('privacyConsent')).privacyConsent === true;
}

async function handleNavigation(tabId, rawUrl) {
  if (!rawUrl?.startsWith('http')) return;
  const prior = await getTabState(tabId);
  let config = { globalMonetizationEnabled: false, merchants: [] };
  if (await hasConsent()) {
    try { config = await fetchConfig(); } catch { /* fail closed */ }
  }
  const next = nextAttributionState({
    rawUrl,
    merchants: config.merchants,
    globalMonetizationEnabled: config.globalMonetizationEnabled,
    prior
  });
  if (next) await setTabState(tabId, next);
}

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) handleNavigation(details.tabId, details.url);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) handleNavigation(details.tabId, details.url);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(storageKey(tabId)));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'GET_CONSENT') return sendResponse({ consent: await hasConsent() });
    if (message.type === 'GET_STATUS') {
      if (message.url) await handleNavigation(message.tabId, message.url);
      return sendResponse(await getTabState(message.tabId));
    }
    if (message.type === 'GET_COUPONS') {
      if (!await hasConsent()) return sendResponse({ ok: false, error: 'Consent required' });
      await handleNavigation(message.tabId, message.url);
      const state = await getTabState(message.tabId);
      if (!state.merchant) return sendResponse({ ok: false, error: 'Unsupported merchant' });
      const currentUrl = new URL(message.url);
      const response = await fetch(`${API_BASE}/v1/coupons?host=${encodeURIComponent(state.hostname)}&path=${encodeURIComponent(currentUrl.pathname)}`);
      return sendResponse({ ok: response.ok, ...(await response.json()) });
    }
    if (message.type === 'ACTIVATE') {
      if (!await hasConsent()) return sendResponse({ ok: false, error: 'Consent required' });
      await handleNavigation(message.tabId, message.url);
      const state = await getTabState(message.tabId);
      if (state.state !== STATES.NO_REFERRAL) return sendResponse({ ok: false, error: 'This session is protected.' });
      if (!state.monetizationEnabled) return sendResponse({ ok: false, error: 'Monetization is disabled for this merchant.' });
      const response = await fetch(`${API_BASE}/v1/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hostname: state.hostname,
          url: (() => { const u = new URL(message.url); return `${u.origin}${u.pathname}`; })(),
          attributionState: state.state,
          explicitUserAction: true
        })
      });
      const result = await response.json();
      if (!response.ok) return sendResponse({ ok: false, error: result.error });
      await setTabState(message.tabId, { ...state, state: STATES.OUR_ACTIVATION, reason: 'Activated by you' });
      return sendResponse({ ok: true, activation: result });
    }
  })().catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
