import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { GraphRunner } from '../src/engine/GraphRunner.js';
import { waitForGatewayReady } from '../src/engine/GatewayReadyWaiter.js';
//
async function executeStartup(data = {}, context = {}, connections = [], extraNodes = []) {
  const steps = [];
  const result = await GraphRunner.execute({
    id: 'startup-test',
    nodes: [{ id: 'startup', type: 'event_bot_startup', data }, ...extraNodes],
    connections
  }, 'BOT_STARTUP', { gatewayConnected: false }, {
    debug: true,
    log: () => {},
    onDebugStep: (step) => steps.push(step),
    ...context
  });
  assert.equal(result.error, null);
  return steps.find((step) => step.nodeId === 'startup');
}

test('startup event fires immediately by default with disconnected status', async () => {
  let waitCalled = false;
  const step = await executeStartup({}, {
    waitForGateway: () => {
      waitCalled = true;
      return Promise.resolve(true);
    }
  });
  assert.equal(waitCalled, false);
  assert.equal(step.outputs.find((output) => output.pinId === 'gateway_connected').value, false);
});

test('startup event can wait indefinitely and exposes the connected result', async () => {
  let timeoutMs;
  const step = await executeStartup({ wait_for_gateway: true, timeout_seconds: 0 }, {
    waitForGateway: async (timeout) => {
      timeoutMs = timeout;
      return true;
    }
  });
  assert.equal(timeoutMs, 0);
  assert.equal(step.outputs.find((output) => output.pinId === 'gateway_connected').value, true);
});

test('startup event reports a disconnected result when its readiness wait expires', async () => {
  const step = await executeStartup({ wait_for_gateway: true, timeout_seconds: 12 }, {
    waitForGateway: async (timeoutMs) => {
      assert.equal(timeoutMs, 12000);
      return false;
    }
  });
  assert.equal(step.outputs.find((output) => output.pinId === 'gateway_connected').value, false);
});

test('connected wait socket overrides the checkbox fallback', async () => {
  let waitCalled = false;
  const step = await executeStartup({ wait_for_gateway: true }, {
    waitForGateway: () => {
      waitCalled = true;
      return Promise.resolve(true);
    }
  }, [{ sourceNodeId: 'value', sourcePinId: 'value', targetNodeId: 'startup', targetPinId: 'wait_for_gateway' }], [
    { id: 'value', type: 'value_boolean', data: { value: false } }
  ]);
  assert.equal(waitCalled, false);
  assert.equal(step.outputs.find((output) => output.pinId === 'gateway_connected').value, false);
});

test('gateway readiness waiter resolves on ready and cleans up its listener', async () => {
  const client = new EventEmitter();
  const waiting = waitForGatewayReady(client, 1000);
  assert.equal(client.listenerCount('ready'), 1);
  client.emit('ready');
  assert.equal(await waiting, true);
  assert.equal(client.listenerCount('ready'), 0);
});

test('gateway readiness waiter times out and can be cancelled', async () => {
  const client = new EventEmitter();
  assert.equal(await waitForGatewayReady(client, 5), false);
  assert.equal(client.listenerCount('ready'), 0);

  const controller = new AbortController();
  const waiting = waitForGatewayReady(client, 0, controller.signal);
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  assert.equal(client.listenerCount('ready'), 0);
});
