import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GatewayIntents,
  GatewayOpcodes,
  ButtonStyles,
  ComponentTypes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  RateLimiter,
  RESTClient,
  InteractionSecurity,
  Client,
  CDN
} from '../src/index.js';
import crypto from 'node:crypto';

describe('Constants & Bitfields', () => {
  test('Gateway Intents bitfield calculation', () => {
    const combined = GatewayIntents.GUILDS | GatewayIntents.GUILD_MESSAGES | GatewayIntents.MESSAGE_CONTENT;
    assert.equal(typeof combined, 'number');
    assert.equal(Boolean(combined & GatewayIntents.GUILDS), true);
    assert.equal(Boolean(combined & GatewayIntents.GUILD_MESSAGES), true);
    assert.equal(Boolean(combined & GatewayIntents.MESSAGE_CONTENT), true);
    assert.equal(Boolean(combined & GatewayIntents.GUILD_VOICE_STATES), false);
  });

  test('Gateway Opcodes mapping', () => {
    assert.equal(GatewayOpcodes.DISPATCH, 0);
    assert.equal(GatewayOpcodes.IDENTIFY, 2);
    assert.equal(GatewayOpcodes.HELLO, 10);
    assert.equal(GatewayOpcodes.HEARTBEAT_ACK, 11);
  });

  test('CDN helper funcs', () => {
    const avatarUrl = CDN.avatar('123456789012345678', 'abcdef123456');
    assert.match(avatarUrl, /https:\/\/cdn\.discordapp\.com\/avatars\/123456789012345678\/abcdef123456\.png/);

    const defaultAvatarUrl = CDN.avatar('123456789012345678', null);
    assert.match(defaultAvatarUrl, /https:\/\/cdn\.discordapp\.com\/embed\/avatars\//);
  });
});

describe('EmbedBuilder', () => {
  test('produces compliant JSON payload', () => {
    const embed = new EmbedBuilder()
      .setTitle('Test Embed')
      .setDescription('Visual Node Execution')
      .setColor('#5865F2')
      .addField('Status', 'Active', true)
      .toJSON();

    assert.equal(embed.title, 'Test Embed');
    assert.equal(embed.description, 'Visual Node Execution');
    assert.equal(embed.color, 0x5865f2);
    assert.deepEqual(embed.fields, [{ name: 'Status', value: 'Active', inline: true }]);
  });
});

describe('Component Builders', () => {
  test('ActionRow and Button builder JSON output', () => {
    const btn = new ButtonBuilder()
      .setCustomId('btn_run')
      .setLabel('Execute Node')
      .setStyle(ButtonStyles.SUCCESS);

    const row = new ActionRowBuilder().addComponents(btn).toJSON();

    assert.equal(row.type, ComponentTypes.ACTION_ROW);
    assert.equal(row.components.length, 1);
    assert.equal(row.components[0].type, ComponentTypes.BUTTON);
    assert.equal(row.components[0].custom_id, 'btn_run');
    assert.equal(row.components[0].style, ButtonStyles.SUCCESS);
  });
});

describe('RateLimiter', () => {
  test('normalizes parameterized Discord route IDs into generalized bucket keys', () => {
    const limiter = new RateLimiter();
    const key1 = limiter.getRouteKey('/channels/123456789012345678/messages', 'POST');
    const key2 = limiter.getRouteKey('/channels/987654321098765432/messages', 'POST');
    assert.equal(key1, key2);
    assert.equal(key1, 'POST:/channels/:id/messages');
  });

  test('handles rate limit header responses', () => {
    const limiter = new RateLimiter();
    const key = 'GET:/users/@me';
    const mockHeaders = new Headers({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset-after': '2.5'
    });

    limiter.handleHeaders(key, mockHeaders, 200, {});
    const bucket = limiter.buckets.get(key);
    assert.ok(bucket);
    assert.equal(bucket.remaining, 0);
    assert.ok(bucket.resetAt > Date.now());
  });
});

describe('Client & RESTClient', () => {
  test('instantiates Client without errors', () => {
    const client = new Client();
    assert.ok(client.rest instanceof RESTClient);
    assert.equal(client.user, null);
    assert.equal(client.ws, null);
  });

  test('uses application emoji routes for app-owned emoji mgmt', async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: '456', name: 'wave', items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
    try {
      const rest = new RESTClient({ token: 'test-token', apiBase: 'https://discord.test/api/v10' });
      await rest.getApplicationEmojis('123');
      await rest.createApplicationEmoji('123', { name: 'wave', image: 'data:image/png;base64,AA==' });
      await rest.deleteApplicationEmoji('123', '456');
      assert.match(calls[0].url, /\/applications\/123\/emojis$/);
      assert.equal(calls[1].init.method, 'POST');
      assert.deepEqual(JSON.parse(calls[1].init.body), { name: 'wave', image: 'data:image/png;base64,AA==' });
      assert.match(calls[2].url, /\/applications\/123\/emojis\/456$/);
      assert.equal(calls[2].init.method, 'DELETE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('InteractionSecurity (Ed25519 Webhook Verification)', () => {
  test('validates authentic Discord interaction signature and rejects tampered ones', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
    const timestamp = Date.now().toString();
    const rawBody = JSON.stringify({ type: 1 });

    const signature = InteractionSecurity.signInteraction(privateKey, timestamp, rawBody);

    const valid = InteractionSecurity.verifyInteraction({
      publicKey: rawPub,
      signature,
      timestamp,
      rawBody
    });
    assert.equal(valid, true);

    const tamperedBody = InteractionSecurity.verifyInteraction({
      publicKey: rawPub,
      signature,
      timestamp,
      rawBody: JSON.stringify({ type: 2 })
    });
    assert.equal(tamperedBody, false);

    const tamperedSig = InteractionSecurity.verifyInteraction({
      publicKey: rawPub,
      signature: '0'.repeat(128),
      timestamp,
      rawBody
    });
    assert.equal(tamperedSig, false);
  });
});
