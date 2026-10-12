import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { transportBaseUrl } from './apiTransport.ts';

test('bundled desktop sends the selected photobooth host through its same-origin bridge', () => {
  assert.equal(transportBaseUrl('https://backend-photobooth.uniinside.net', 'app-photobooth:'), 'app-photobooth://ui');
  assert.equal(transportBaseUrl('https://api.uniinside.net', 'app-photobooth:'), 'https://api.uniinside.net');
  assert.equal(transportBaseUrl('https://backend-photobooth.uniinside.net', 'https:'), 'https://backend-photobooth.uniinside.net');
});

test('both Axios and fetch consumers select the desktop transport while preserving display host', () => {
  const api = readFileSync(new URL('./apiService.ts', import.meta.url), 'utf8');
  const storage = readFileSync(new URL('./storageService.ts', import.meta.url), 'utf8');
  assert.match(api, /transportBaseUrl\(rawUrl, window\.location\.protocol\)/);
  assert.match(storage, /transportBaseUrl\(resolveBackendBaseUrl\(import\.meta\.env\.VITE_API_BASE_URL, storedBackendUrl\), window\.location\.protocol\)/);
  assert.match(api, /transportBaseUrl\(origin, window\.location\.protocol\)/);
  assert.match(storage, /backendUrl: resolveBackendBaseUrl\(import\.meta\.env\.VITE_API_BASE_URL, parsed\.backendUrl\)/);
});

test('main process only proxies the selected API path and does not forward browser Origin', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.match(main, /u\.hostname === 'ui' && u\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(main, /new URL\(u\.pathname \+ u\.search, BACKEND_PHOTOBOOTH\)/);
  assert.match(main, /net\.fetch\(target\.href/);
  assert.match(main, /\['accept', 'content-type', 'x-api-key'\]/);
});
