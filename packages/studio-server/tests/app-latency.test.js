import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BotManager } from '../src/engine/BotManager.js';
//
function makeManager({ token = null, probe = async () => ({ id: 'application' }) } = {}) {
  const messages = [];
  const manager = Object.create(BotManager.prototype);
  Object.assign(manager, {
    project: { id: 'project-test' },
    projectVariables: [{ id: 'project_var_app_latency', name: 'APP_LATENCY', type: 'number', initialValue: 0, systemManaged: true }],
    projectVariableStates: new Map(),
    mockProjectVariableStates: new Map(),
    gatewayLatencySamples: [],
    gatewayMetrics: { latencyMs: null, averageLatencyMs: null, jitterMs: null, lastHeartbeatAt: null },
    getBotToken: () => token,
    createTrackedRESTClient: () => ({ getCurrentApplication: probe }),
    broadcastWS: (message) => messages.push(message)
  });
  return { manager, messages };
}

test('APP_LATENCY measures application API response time and updates live and mock project state', async () => {
  const { manager, messages } = makeManager();
  manager.projectVariableStates.set('project_var_app_latency', 0);
  manager.mockProjectVariableStates.set('project_var_app_latency', 0);

  const latency = manager.updateAppLatency(17.6);

  assert.equal(latency, 18);
  assert.equal(manager.projectVariables[0].initialValue, 18);
  assert.equal(manager.projectVariableStates.get('project_var_app_latency'), 18);
  assert.equal(manager.mockProjectVariableStates.get('project_var_app_latency'), 18);
  assert.equal(messages.at(-1).payload.variables[0].initialValue, 18);
});

test('APP_LATENCY stays at zero without a configured token and does not probe Discord', async () => {
  let probeCalls = 0;
  const { manager } = makeManager({
    token: null,
    probe: async () => { probeCalls += 1; return { id: 'application' }; }
  });

  assert.equal(await manager.refreshAppLatency(), 0);
  assert.equal(manager.projectVariables[0].initialValue, 0);
  assert.equal(probeCalls, 0);
});

test('APP_LATENCY resets to zero when the application request fails', async () => {
  const { manager } = makeManager({
    token: 'configured-token',
    probe: async () => { throw new Error('Discord is unavailable'); }
  });
  manager.projectVariables[0].initialValue = 120;
  manager.projectVariableStates.set('project_var_app_latency', 120);

  assert.equal(await manager.refreshAppLatency(), 0);
  assert.equal(manager.projectVariables[0].initialValue, 0);
  assert.equal(manager.projectVariableStates.get('project_var_app_latency'), 0);
});

test('saving other variables preserves the latest server managed APP_LATENCY value', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-app-latency-'));
  const { manager } = makeManager();
  manager.projectVariables = [
    { id: 'project_var_app_latency', name: 'APP_LATENCY', type: 'number', initialValue: 240, systemManaged: true },
    { id: 'project_var_status', name: 'status', type: 'string', initialValue: 'old' }
  ];
  manager.projectVariablesPath = path.join(directory, 'variables.json');
  manager.disabledBuiltInProjectVariables = new Set();
  manager.projectStore = { projects: [], persist() {} };
  manager.projectVariableStates.set('project_var_app_latency', 240);
  manager.mockProjectVariableStates.set('project_var_app_latency', 240);

  try {
    manager.setProjectVariables([
      { id: 'project_var_app_latency', name: 'APP_LATENCY', type: 'number', initialValue: 120 },
      { id: 'project_var_status', name: 'status', type: 'string', initialValue: 'new' }
    ]);

    assert.equal(manager.projectVariables[0].initialValue, 240);
    assert.equal(manager.projectVariableStates.get('project_var_app_latency'), 240);
    assert.equal(manager.projectVariables[1].initialValue, 'new');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('deleted APP_LATENCY can be recreated as a regular variable without ARC reclaiming it', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-app-latency-relinquish-'));
  const { manager } = makeManager();
  manager.projectVariablesPath = path.join(directory, 'variables.json');
  manager.disabledBuiltInProjectVariables = new Set();
  manager.projectStore = { projects: [], persist() {} };
  manager.projectVariables[0].initialValue = 200;

  try {
    manager.setProjectVariables([]);
    assert.equal(manager.disabledBuiltInProjectVariables.has('APP_LATENCY'), true);

    manager.setProjectVariables([{
      id: 'project_var_user_latency',
      name: 'APP_LATENCY',
      type: 'number',
      initialValue: 42
    }]);

    assert.equal(manager.projectVariables[0].systemManaged, undefined);
    assert.equal(manager.projectVariables[0].initialValue, 42);
    assert.equal(manager.ensureAppLatencyVariable(), false);
    assert.equal(manager.projectVariables[0].initialValue, 42);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('BotManager initializes uptime state before startup cleanup can run', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-manager-startup-'));
  const project = { id: 'project_12345678-1234-4234-8234-123456789012', name: 'Startup test', emptyStart: true };
  const broadcasts = [];
  const projectStore = {
    projects: [project],
    active: () => project,
    directory: () => directory,
    persist() {}
  };

  try {
    const manager = new BotManager({
      projectStore,
      projectId: project.id,
      broadcastWS(message) {
        assert.equal(message.payload.projectId, project.id);
        broadcasts.push(message);
      }
    });
    assert.equal(manager.projectVariables.some((variable) => variable.name === 'BOT_UPTIME'), true);
    assert.equal(manager.botUptimeInterval, null);
    assert.ok(broadcasts.some((message) => message.type === 'PROJECT_VARIABLES_UPDATED'));
    clearInterval(manager.appLatencyMonitor);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('APP_LATENCY queues a fresh probe after the configured token changes mid request', async () => {
  let token = 'old-token';
  let finishOldProbe;
  const probes = [];
  const { manager } = makeManager({ token: null });
  manager.getBotToken = () => token;
  manager.createTrackedRESTClient = (probeToken) => ({
    getCurrentApplication: () => {
      probes.push(probeToken);
      return probeToken === 'old-token'
        ? new Promise((resolve) => { finishOldProbe = resolve; })
        : Promise.resolve({ id: 'application' });
    }
  });

  const oldProbe = manager.refreshAppLatency();
  token = 'new-token';
  await manager.refreshAppLatency();
  finishOldProbe({ id: 'application' });
  await oldProbe;
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(probes, ['old-token', 'new-token']);
});

test('APP_LATENCY monitor runs independently of Gateway status', () => {
  const { manager } = makeManager({ token: null });
  manager.status = 'DISCONNECTED';

  manager.startAppLatencyMonitor();

  assert.ok(manager.appLatencyMonitor);
  clearInterval(manager.appLatencyMonitor);
});

test('GATEWAY_LATENCY follows heartbeat samples and resets when disconnected', () => {
  const { manager, messages } = makeManager();
  manager.projectVariables.push({
    id: 'project_var_gateway_latency',
    name: 'GATEWAY_LATENCY',
    type: 'number',
    initialValue: 0,
    systemManaged: true
  });
  manager.projectVariableStates.set('project_var_gateway_latency', 0);
  manager.mockProjectVariableStates.set('project_var_gateway_latency', 0);

  manager.recordGatewayLatency(42.6);

  assert.equal(manager.projectVariableStates.get('project_var_gateway_latency'), 43);
  assert.equal(manager.mockProjectVariableStates.get('project_var_gateway_latency'), 43);
  assert.ok(messages.some((message) => message.type === 'PROJECT_VARIABLES_UPDATED'
    && message.payload.variables.find((variable) => variable.id === 'project_var_gateway_latency')?.initialValue === 43));

  manager.resetGatewayLatency();

  assert.equal(manager.projectVariables[1].initialValue, 0);
  assert.equal(manager.projectVariableStates.get('project_var_gateway_latency'), 0);
});

test('BOT_UPTIME counts runtime seconds and returns to zero when stopped', () => {
  const { manager } = makeManager();
  manager.projectVariables.push({
    id: 'project_var_bot_uptime',
    name: 'BOT_UPTIME',
    type: 'number',
    initialValue: 0,
    systemManaged: true
  });
  manager.projectVariableStates.set('project_var_bot_uptime', 0);
  manager.mockProjectVariableStates.set('project_var_bot_uptime', 0);

  manager.startBotUptime();
  manager.botUptimeStartedAt = performance.now() - 2300;
  assert.equal(manager.updateBotUptime(), 2);
  assert.equal(manager.projectVariableStates.get('project_var_bot_uptime'), 2);

  manager.stopBotUptime();

  assert.equal(manager.projectVariables[1].initialValue, 0);
  assert.equal(manager.projectVariableStates.get('project_var_bot_uptime'), 0);
  assert.equal(manager.botUptimeInterval, null);
});

test('deleted managed latency and uptime variables can be recreated without ARC reclaiming them', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-managed-variable-relinquish-'));
  const { manager } = makeManager();
  manager.projectVariablesPath = path.join(directory, 'variables.json');
  manager.disabledBuiltInProjectVariables = new Set();
  manager.projectStore = { projects: [], persist() {} };

  try {
    manager.ensureGatewayLatencyVariable();
    manager.ensureBotUptimeVariable();
    assert.equal(manager.projectVariables.length, 3);

    manager.setProjectVariables([]);
    manager.setProjectVariables([
      { id: 'project_var_custom_gateway_latency', name: 'GATEWAY_LATENCY', type: 'number', initialValue: 73 },
      { id: 'project_var_custom_bot_uptime', name: 'BOT_UPTIME', type: 'number', initialValue: 19 }
    ]);

    assert.equal(manager.projectVariables[0].initialValue, 73);
    assert.equal(manager.projectVariables[1].initialValue, 19);
    assert.equal(manager.ensureGatewayLatencyVariable(), false);
    assert.equal(manager.ensureBotUptimeVariable(), false);
    assert.equal(manager.projectVariables[0].initialValue, 73);
    assert.equal(manager.projectVariables[1].initialValue, 19);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
