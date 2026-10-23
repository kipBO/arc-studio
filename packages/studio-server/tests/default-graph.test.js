import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BotManager } from '../src/engine/BotManager.js';
//
function createMockBotManager(directory) {
  const broadcastMessages = [];
  const manager = Object.create(BotManager.prototype);
  Object.assign(manager, {
    graphLibraryPath: path.join(directory, 'graph-library.json'),
    graphs: new Map([
      ['tab_slash_help', { id: 'tab_slash_help', name: 'Slash: /help', nodes: [], connections: [] }],
      ['custom_graph_1', { id: 'custom_graph_1', name: 'Custom Graph 1', nodes: [], connections: [] }]
    ]),
    graphTemplates: [
      { id: 'template_welcome', name: 'Welcome Template', nodes: [], connections: [] }
    ],
    graphSnapshots: [],
    defaultGraphId: 'tab_slash_help',
    broadcastWS: (message) => broadcastMessages.push(message)
  });
  return { manager, broadcastMessages };
}

test('setDefaultGraph updates default graph and broadcasts update', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-default-graph-test-'));
  try {
    const { manager, broadcastMessages } = createMockBotManager(tempDir);

    const result = manager.setDefaultGraph('custom_graph_1');
    assert.equal(result, 'custom_graph_1');
    assert.equal(manager.defaultGraphId, 'custom_graph_1');
    assert.equal(broadcastMessages.length, 1);
    assert.equal(broadcastMessages[0].type, 'GRAPH_LIBRARY_UPDATED');
    assert.equal(broadcastMessages[0].payload.defaultGraphId, 'custom_graph_1');

    const resetResult = manager.setDefaultGraph('tab_slash_help');
    assert.equal(resetResult, 'tab_slash_help');
    assert.equal(manager.defaultGraphId, 'tab_slash_help');
    assert.equal(broadcastMessages.length, 2);
    assert.equal(broadcastMessages[1].payload.defaultGraphId, 'tab_slash_help');

    manager.setDefaultGraph('custom_graph_1');
    const emptyResult = manager.setDefaultGraph('');
    assert.equal(emptyResult, 'tab_slash_help');
    assert.equal(manager.defaultGraphId, 'tab_slash_help');

    assert.throws(() => manager.setDefaultGraph('non_existent_graph'), /Choose a saved graph or template as the default/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
