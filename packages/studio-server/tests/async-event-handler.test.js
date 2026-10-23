import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { registerAsyncEventHandler } from '../src/engine/AsyncEventHandler.js';
//
test('async event handler reports rejected Discord requests instead of leaking rejections', async () => {
  const emitter = new EventEmitter();
  const failures = [];
  const unhandled = [];
  const onUnhandledRejection = (error) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandledRejection);
  registerAsyncEventHandler(emitter, 'messageCreate', async () => {
    const error = new Error('Missing Access');
    error.name = 'DiscordAPIError';
    error.status = 403;
    error.code = 50001;
    throw error;
  }, (error, eventName) => failures.push({ error, eventName }));

  try {
    emitter.emit('messageCreate', { id: 'message-1' });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(failures.length, 1);
    assert.equal(failures[0].eventName, 'messageCreate');
    assert.equal(failures[0].error.code, 50001);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
});
