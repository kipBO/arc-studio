/**
 * Emits `gatewayDispatch` with the raw Discord event name and payload for every Gateway dispatch
 */
import { EventEmitter } from 'node:events';
import { RESTClient } from '../rest/RESTClient.js';
import { GatewayShard } from '../gateway/GatewayShard.js';
import { GatewayIntents, GatewayOpcodes, InteractionCallbackTypes } from '../constants.js';
//
export class Client extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.intents]
   * @param {string} [options.token]
   */
  constructor(options = {}) {
    super();
    this.token = options.token || null;
    this.intents = options.intents ?? (
      GatewayIntents.GUILDS |
      GatewayIntents.GUILD_MESSAGES |
      GatewayIntents.MESSAGE_CONTENT |
      GatewayIntents.GUILD_EMOJIS_AND_STICKERS
    );

    this.rest = new RESTClient({ token: this.token });
    /** @type {GatewayShard|null} */
    this.ws = null;
    this.user = null;
    this.readyAt = null;
  }

  /**
   * Connect to Discord Gateway and init REST
   * @param {string} [token]
   * @returns {Promise<Client>}
   */
  async login(token) {
    if (token) this.token = token;
    if (!this.token) throw new Error('A valid Discord Bot Token must be provided to login.');

    this.rest.setToken(this.token);

    this.ws = new GatewayShard({
      token: this.token,
      intents: this.intents
    });
//
    this.ws.on('status', (status) => this.emit('status', status));
    this.ws.on('heartbeatLatency', (latencyMs) => this.emit('heartbeatLatency', latencyMs));
    this.ws.on('diagnostics', (diagnostics) => this.emit('gatewayDiagnostics', diagnostics));
    this.ws.on('dispatch', (eventName, payload) => this.emit('gatewayDispatch', eventName, payload));
    this.ws.on('debug', (msg) => this.emit('debug', msg));
    this.ws.on('error', (err) => this.emit('error', err));
    this.ws.on('fatalError', (err) => this.emit('fatalError', err));
    this.emit('gatewayDiagnostics', this.ws.getDiagnostics());

    this.ws.on('READY', (data) => {
      this.user = data.user;
      this.readyAt = new Date();
      this.emit('ready', this);
    });

    this.ws.on('MESSAGE_CREATE', (msg) => this.emit('messageCreate', msg));
    this.ws.on('INTERACTION_CREATE', (interaction) => this.emit('interactionCreate', interaction));
    this.ws.on('GUILD_CREATE', (guild) => this.emit('guildCreate', guild));
    this.ws.on('GUILD_MEMBER_ADD', (member) => this.emit('guildMemberAdd', member));

    for (const eventName of [
      'MESSAGE_UPDATE', 'MESSAGE_DELETE', 'MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE',
      'CHANNEL_CREATE', 'CHANNEL_UPDATE', 'CHANNEL_DELETE', 'GUILD_MEMBER_REMOVE',
      'VOICE_STATE_UPDATE', 'PRESENCE_UPDATE', 'GUILD_BAN_ADD', 'GUILD_BAN_REMOVE',
      'GUILD_SCHEDULED_EVENT_CREATE', 'GUILD_SCHEDULED_EVENT_UPDATE', 'GUILD_SCHEDULED_EVENT_DELETE',
      'AUTO_MODERATION_ACTION_EXECUTION', 'GUILD_CREATE', 'GUILD_UPDATE', 'GUILD_DELETE',
      'GUILD_ROLE_CREATE', 'GUILD_ROLE_UPDATE', 'GUILD_ROLE_DELETE', 'THREAD_CREATE', 'THREAD_UPDATE',
      'THREAD_DELETE', 'TYPING_START', 'CHANNEL_PINS_UPDATE', 'MESSAGE_REACTION_REMOVE_ALL',
      'INVITE_CREATE', 'INVITE_DELETE'
    ]) this.ws.on(eventName, (payload) => this.emit(eventName, payload));

    this.ws.connect();
    return this;
  }
//
  destroy() {
    if (this.ws) {
      this.ws.destroy();
      this.ws = null;
    }
    this.user = null;
    this.readyAt = null;
    this.emit('destroy');
  }

  getGatewayDiagnostics() {
    return this.ws?.getDiagnostics() || {
      shardId: 0,
      status: 'DISCONNECTED',
      reconnectAttempts: 0,
      lastCloseCode: null,
      lastCloseReason: '',
      heartbeatLatencyMs: null,
      sessionResumed: null,
      resumeCount: 0,
      hasResumableSession: false
    };
  }

  /**
   * @param {object} presence
   */
  setPresence(presence) {
    if (this.ws) {
      this.ws.updatePresence(presence);
    }
  }

  setVoiceChannel(guildId, channelId, options = {}) {
    if (!this.ws) throw new Error('Connect to the Discord Gateway before changing voice state.');
    if (!guildId) throw new TypeError('A guild ID is required.');
    this.ws.send(GatewayOpcodes.VOICE_STATE_UPDATE, {
      guild_id: String(guildId),
      channel_id: channelId ? String(channelId) : null,
      self_mute: Boolean(options.selfMute),
      self_deaf: Boolean(options.selfDeaf)
    });
  }

  /**
   * @param {string} channelId
   * @param {string|object} contentOrPayload
   */
  async sendMessage(channelId, contentOrPayload) {
    return this.rest.createMessage(channelId, contentOrPayload);
  }

  /**
   * @param {string} channelId
   * @param {string} messageId
   * @param {string|object} contentOrPayload
   */
  async editMessage(channelId, messageId, contentOrPayload) {
    return this.rest.editMessage(channelId, messageId, contentOrPayload);
  }

  /**
   * @param {string} interactionId
   * @param {string} interactionToken
   * @param {object} responseData
   */
  async replyInteraction(interactionId, interactionToken, responseData) {
    return this.rest.createInteractionResponse(interactionId, interactionToken, {
      type: InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
      data: typeof responseData === 'string' ? { content: responseData } : responseData
    });
  }
}
