import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolveBackendBaseUrl } from './backendUrl.ts';
import { selectKioskApiKey, parseAdminKioskCredentials } from './kioskApiKey.ts';

const productionEnv = readFileSync(new URL('../.env.production', import.meta.url), 'utf8');

test('production installer targets the dedicated photobooth backend', () => {
  assert.match(productionEnv, /^VITE_API_BASE_URL=https:\/\/backend-photobooth\.uniinside\.net\s*$/m);
});

test('Admin clipboard bundle yields only DEVICE_TOKEN and its DEVICE_ID', () => {
  assert.deepEqual(parseAdminKioskCredentials('DEVICE_ID=KSK-1234\nDEVICE_TOKEN=kiosk_abcdef'),
    { apiKey: 'kiosk_abcdef', kioskId: 'KSK-1234' });
  assert.deepEqual(parseAdminKioskCredentials('DEVICE_ID=KSK-1234DEVICE_TOKEN=kiosk_abcdef'),
    { apiKey: 'kiosk_abcdef', kioskId: 'KSK-1234' });
  assert.deepEqual(parseAdminKioskCredentials('kiosk_abcdef'), { apiKey: 'kiosk_abcdef' });
  assert.equal(selectKioskApiKey('DEVICE_ID=KSK-1234\nDEVICE_TOKEN=kiosk_abcdef'), 'kiosk_abcdef');
});

test('a malformed Admin bundle cannot be sent as an API key', () => {
  assert.deepEqual(parseAdminKioskCredentials('DEVICE_ID=KSK-1234'), { apiKey: '' });
  assert.deepEqual(parseAdminKioskCredentials('DEVICE_TOKEN='), { apiKey: '' });
});

test('a newly entered admin key wins over the build key and previous saved key', () => {
  assert.equal(selectKioskApiKey('kiosk_new', 'kiosk_previous', 'kiosk_built'), 'kiosk_new');
  assert.equal(selectKioskApiKey('', 'kiosk_previous', 'kiosk_built'), 'kiosk_previous');
});

const storage = readFileSync(new URL('./storageService.ts', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../components/KioskSettings.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('./apiService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('desktop startup paste keeps the Admin clipboard intact and saves ID plus token separately', () => {
  assert.match(app, /onPaste=\{handleCredentialsPaste\}/);
  assert.match(app, /parseAdminKioskCredentials\(apiKeyInput\)/);
  assert.match(app, /kioskId: credentials\.kioskId \|\| pastedKioskId \|\| config\.kioskId/);
  assert.match(app, /localStorage\.setItem\('unismiles_kiosk_api_key', credentials\.apiKey\)/);
});

test('settings save and test use extracted token, not the two-line Admin clipboard', () => {
  assert.match(settings, /parseAdminKioskCredentials\(apiKey\)/);
  assert.match(settings, /checkBackendHealth\(backendUrl, credentials\.apiKey\)/);
  assert.match(settings, /localStorage\.setItem\('unismiles_kiosk_api_key', credentials\.apiKey\)/);
});

test('admin key saved in settings reaches the next connection request', () => {
  assert.match(settings, /saveAppConfig\(updatedConfig\);\s*localStorage\.setItem\('unismiles_kiosk_api_key', credentials\.apiKey\)/);
  assert.match(api, /selectKioskApiKey\(registeredKioskApiKey, parsed\.apiKey, import\.meta\.env\.VITE_KIOSK_API_KEY\)/);
  assert.match(api, /config\.headers\['x-api-key'\] = appConfig\.apiKey/);
});

test('a stale saved admin API URL cannot override the installer photobooth backend', () => {
  assert.equal(
    resolveBackendBaseUrl(
      'https://backend-photobooth.uniinside.net',
      'https://api.uniinside.net/api/v1',
    ),
    'https://backend-photobooth.uniinside.net',
  );
});

test('saved backend URL is only a fallback and API prefixes are normalized', () => {
  assert.equal(
    resolveBackendBaseUrl('', 'https://saved.example/api/v1/kiosk/'),
    'https://saved.example',
  );
});

test('the build-time backend URL takes priority over a stale URL saved in kiosk storage', () => {
  assert.ok(
    storage.includes('resolveBackendBaseUrl(import.meta.env.VITE_API_BASE_URL, storedBackendUrl)'),
    'API-base consumers must resolve the build-time backend before consulting saved settings',
  );
  assert.ok(
    storage.includes('resolveBackendBaseUrl(import.meta.env.VITE_API_BASE_URL, parsed.backendUrl)'),
    'the key-entry screen and settings must display/test the build-time backend, not a saved stale URL',
  );
});
