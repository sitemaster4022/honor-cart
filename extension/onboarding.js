const checkbox = document.querySelector('#consent');
const save = document.querySelector('#save');
const disable = document.querySelector('#disable');
const result = document.querySelector('#result');

checkbox.addEventListener('change', () => { save.disabled = !checkbox.checked; });

save.addEventListener('click', async () => {
  await chrome.storage.local.set({ privacyConsent: true, consentVersion: 1 });
  result.textContent = 'Coupon lookup is enabled. You can close this page.';
});

disable.addEventListener('click', async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  checkbox.checked = false;
  save.disabled = true;
  result.textContent = 'Consent and extension data have been cleared.';
});

chrome.storage.local.get('privacyConsent').then(({ privacyConsent }) => {
  checkbox.checked = privacyConsent === true;
  save.disabled = !checkbox.checked;
});
