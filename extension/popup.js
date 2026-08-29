const statusEl = document.querySelector('#status');
const merchantEl = document.querySelector('#merchant');
const findButton = document.querySelector('#find');
const activateButton = document.querySelector('#activate');
const couponsEl = document.querySelector('#coupons');
let tab;
let state;

function message(payload) {
  return chrome.runtime.sendMessage({ ...payload, tabId: tab.id });
}

function showStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const consent = await message({ type: 'GET_CONSENT' });
  if (!consent.consent) {
    showStatus('Setup required', 'protected');
    merchantEl.textContent = 'Review the privacy disclosure before using coupon lookup.';
    const setup = document.createElement('button');
    setup.textContent = 'Review & continue';
    setup.addEventListener('click', () => chrome.runtime.openOptionsPage());
    couponsEl.append(setup);
    return;
  }
  state = await message({ type: 'GET_STATUS', url: tab.url });
  if (!state.merchant) {
    showStatus('This merchant is not supported', 'error');
    merchantEl.textContent = 'No coupon or affiliate action will occur.';
    return;
  }
  merchantEl.textContent = state.merchant.displayName;
  findButton.disabled = !state.merchant.couponSupport;
  if (state.state === 'PROTECTED_REFERRAL') {
    showStatus('Existing referral protected', 'protected');
    activateButton.disabled = true;
  } else if (state.state === 'OUR_ACTIVATION') {
    showStatus('Activated by you');
  } else {
    showStatus('No existing referral detected');
    activateButton.disabled = !state.monetizationEnabled;
    if (!state.monetizationEnabled) {
      activateButton.textContent = 'Affiliate activation unavailable';
      document.querySelector('#activation-note').textContent = 'Monetization is disabled for this beta merchant. Coupon lookup does not claim attribution.';
    }
  }
}

findButton.addEventListener('click', async () => {
  findButton.disabled = true;
  const result = await message({ type: 'GET_COUPONS', url: tab.url });
  couponsEl.textContent = '';
  if (!result.ok) { couponsEl.textContent = result.error; return; }
  if (!result.coupons?.length) { couponsEl.textContent = 'No coupons are available right now.'; return; }
  for (const coupon of result.coupons) {
    const row = document.createElement('div');
    row.className = 'coupon';
    const code = document.createElement('code');
    code.textContent = coupon.code;
    row.append(code, document.createTextNode(` — ${coupon.description}`));
    couponsEl.append(row);
  }
});

activateButton.addEventListener('click', async () => {
  activateButton.disabled = true;
  const result = await message({ type: 'ACTIVATE', url: tab.url });
  if (!result.ok) { showStatus(`Not activated: ${result.error}`, 'protected'); return; }
  showStatus('Activated by you');
  if (result.activation.url) await chrome.tabs.update(tab.id, { url: result.activation.url });
});

init().catch((error) => showStatus(error.message, 'error'));
