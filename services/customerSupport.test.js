import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/PhotoBooth.tsx', import.meta.url), 'utf8');
test('landing shows compact customer support details outside photo output', () => {
  const landing = source.slice(source.indexOf("{step === 'LANDING' && ("), source.indexOf("{step === 'PACKAGE' && ("));
  assert.match(landing, /id="photobooth-customer-support"/);
  assert.match(landing, /087897574789/);
  assert.match(landing, /uninsidemed@gmail\.com/);
  assert.match(landing, /pertanyaan maupun kendala penggunaan photobooth/i);
  assert.match(landing, /text-xs/);
  assert.equal(source.split('id="photobooth-customer-support"').length - 1, 1);
});
