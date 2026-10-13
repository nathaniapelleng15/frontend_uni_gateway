import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { frameCacheStorageKey, resolveFrameArtworkUrl, shouldRefreshFrameCatalog } from './frameAssets.ts';

test('Photobooth routes resolved Admin artwork into the shared frame image layer', () => {
  const source = readFileSync(new URL('../components/PhotoBooth.tsx', import.meta.url), 'utf8');
  assert.match(source, /resolveFrameArtworkUrl\(style, canonical, getApiConfig\(\)\.baseUrl\)/);
  assert.match(source, /overlayUrl:\s*bustFrameAssetCache\(artworkUrl\)/);
  assert.match(source, /src=\{frameToRender\.overlayUrl\}/);
});

test('resolves Admin Set BG overlayUrl for the kiosk preview', () => {
  assert.equal(
    resolveFrameArtworkUrl({ overlayUrl: '/uploads/assets/frame.png' }, {}, 'https://api.example.test'),
    'https://api.example.test/uploads/assets/frame.png'
  );
});

test('uses an image URL stored inside Admin backgroundConfig when overlayUrl is absent', () => {
  assert.equal(
    resolveFrameArtworkUrl({ backgroundConfig: { type: 'image', imageUrl: '/uploads/bg.webp' } }, {}, 'https://api.example.test'),
    'https://api.example.test/uploads/bg.webp'
  );
});

test('supports backend snake_case and legacy image fields', () => {
  assert.equal(
    resolveFrameArtworkUrl({}, { background_config: { type: 'image', image_url: 'uploads/legacy.png' } }, 'https://api.example.test'),
    'https://api.example.test/uploads/legacy.png'
  );
});

test('preserves absolute, data, and blob image URLs', () => {
  assert.equal(resolveFrameArtworkUrl({ overlay_url: 'https://cdn.example.test/frame.png' }, {}, 'https://api.example.test'), 'https://cdn.example.test/frame.png');
  assert.equal(resolveFrameArtworkUrl({ backgroundImageUrl: 'data:image/png;base64,abc' }, {}, 'https://api.example.test'), 'data:image/png;base64,abc');
  assert.equal(resolveFrameArtworkUrl({ background_image_url: 'blob:preview' }, {}, 'https://api.example.test'), 'blob:preview');
});

test('frame Admin lokal memakai aset dari backend aktif, bukan PUBLIC_BASE_URL yang salah', () => {
  assert.equal(resolveFrameArtworkUrl(
    { overlayUrl: 'https://api.uniinside.net/uploads/assets/frame.png' },
    { overlayUrl: '/uploads/assets/frame.png' },
    'http://127.0.0.1:8000/api/v1',
  ), 'http://127.0.0.1:8000/uploads/assets/frame.png');
});

test('frame Admin online tetap memakai URL backend online; cache tidak melintasi backend', () => {
  const style = { overlayUrl: 'https://backend-photobooth.uniinside.net/uploads/assets/frame.png' };
  assert.equal(resolveFrameArtworkUrl(style, { overlayUrl: '/uploads/assets/frame.png' }, 'app-photobooth://ui'), style.overlayUrl);
  assert.notEqual(frameCacheStorageKey('http://127.0.0.1:8000', 'aaa'),
    frameCacheStorageKey('app-photobooth://ui', 'aaa'));
  assert.equal(shouldRefreshFrameCatalog('EDIT', 'visible'), true);
  assert.equal(shouldRefreshFrameCatalog('CAPTURE', 'visible'), false);
});
