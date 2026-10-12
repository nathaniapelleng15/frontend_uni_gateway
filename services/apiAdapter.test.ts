import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as apiTransport from './apiTransport.ts';

test('bundled desktop uses the fetch adapter because Axios XHR rejects app-photobooth scheme before sending', () => {
  const select = (apiTransport as Record<string, unknown>).apiAdapterForProtocol as ((protocol: string) => string | undefined) | undefined;
  assert.equal(typeof select, 'function');
  assert.equal(select?.('app-photobooth:'), 'fetch');
  assert.equal(select?.('https:'), undefined);
});
