import assert from 'node:assert/strict';
import test from 'node:test';
import { probeInternetConnectivity } from '../src/core/networkConnectivity.js';
//
test('connectivity probe makes one uncached no-cors request and accepts a reachable check endpoint', async () => {
  const calls = [];
  const reachable = await probeInternetConnectivity(async (...args) => {
    calls.push(args);
    return { type: 'opaque' };
  });

  assert.equal(reachable, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://www.gstatic.com/generate_204');
  assert.equal(calls[0][1].mode, 'no-cors');
  assert.equal(calls[0][1].cache, 'no-store');
});

test('connectivity probe returns false when the network request fails', async () => {
  const reachable = await probeInternetConnectivity(async () => {
    throw new TypeError('Network request failed');
  });

  assert.equal(reachable, false);
});
