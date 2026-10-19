import { API_BASE } from '../constants.js';
import { RateLimiter } from './RateLimiter.js';
import { createHash } from 'node:crypto';

const COMMAND_CREATE_LIMIT = 200;
const COMMAND_CREATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const COMMAND_DEPLOY_COOLDOWN_MS = 30 * 1000;
const MAX_ATTACHMENT_COUNT = 10;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENT_REQUEST_BYTES = 24 * 1024 * 1024;
const commandDeployments = new Map();
const sharedRateLimiters = new Map();
//
function parseAttachmentData(file) {
  const raw = String(file?.data ?? file?.dataUrl ?? file?.file_data ?? '');
  const dataUrl = /^data:([^;,\s]+)?;base64,([A-Za-z0-9+/]+={0,2})$/i.exec(raw);
  const base64 = dataUrl ? dataUrl[2] : raw;
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new TypeError(`Attachment “${file?.filename || file?.name || 'file'}” must contain valid base64 data or a base64 data URL.`);
  }
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw new TypeError('Attachments cannot be empty.');
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new RangeError(`Each Discord attachment must be 20 MiB or smaller (received ${file?.filename || file?.name || 'file'}).`);
  const filename = String(file?.filename || file?.name || 'attachment.bin').replace(/[\\/\0-\x1f]/g, '_').slice(0, 100) || 'attachment.bin';
  const contentType = String(file?.contentType || file?.content_type || dataUrl?.[1] || 'application/octet-stream').slice(0, 127);
  return { bytes, filename, contentType, description: file?.description, isSpoiler: Boolean(file?.is_spoiler ?? file?.isSpoiler) };
}

function buildMultipartBody(payload, legacyFileData, legacyFileName) {
  if (!payload || typeof payload !== 'object') return payload;
  let files = payload.files;
  if (typeof files === 'string' && files.trim()) {
    try { files = JSON.parse(files); } catch { throw new TypeError('Files must be a JSON array of file objects.'); }
  }
  if (files != null && !Array.isArray(files)) throw new TypeError('Files must be an array of file objects.');
  files = [...(files || [])];
  const oldData = legacyFileData ?? payload.file_data;
  if (oldData) files.unshift({ data: oldData, filename: legacyFileName ?? payload.file_name ?? 'attachment.bin' });
  if (!files.length) {
    for (const embed of payload.embeds || []) {
      for (const url of [embed?.image?.url, embed?.thumbnail?.url]) {
        const reference = /^attachment:\/\/(.+)$/.exec(String(url || ''));
        if (reference) throw new TypeError(`Embed image “${reference[1]}” must match one of the attached filenames.`);
      }
    }
    const clean = { ...payload };
    delete clean.files;
    delete clean.file_data;
    delete clean.file_name;
    return clean;
  }
  if (files.length > MAX_ATTACHMENT_COUNT) throw new RangeError(`A message can include at most ${MAX_ATTACHMENT_COUNT} files.`);
  const normalized = files.map(parseAttachmentData);
  const totalBytes = normalized.reduce((total, file) => total + file.bytes.length, 0);
  if (totalBytes > MAX_ATTACHMENT_REQUEST_BYTES) throw new RangeError('Attachments must total 24 MiB or less so the complete Discord request stays under its 25 MiB limit.');
  const usedNames = new Set();
  for (const file of normalized) {
    const key = file.filename.toLowerCase();
    if (usedNames.has(key)) throw new TypeError(`Attachment filenames must be unique: ${file.filename}`);
    usedNames.add(key);
  }
  for (const embed of payload.embeds || []) {
    for (const url of [embed?.image?.url, embed?.thumbnail?.url]) {
      const reference = /^attachment:\/\/(.+)$/.exec(String(url || ''));
      if (reference && !usedNames.has(reference[1].toLowerCase())) throw new TypeError(`Embed image “${reference[1]}” must match one of the attached filenames.`);
    }
  }
  const clean = { ...payload };
  delete clean.files;
  delete clean.file_data;
  delete clean.file_name;
  clean.attachments = normalized.map((file, id) => ({
    id,
    filename: file.filename,
    ...(file.description ? { description: String(file.description).slice(0, 1024) } : {}),
    ...(file.isSpoiler ? { is_spoiler: true } : {})
  }));
  const form = new FormData();
  form.append('payload_json', JSON.stringify(clean));
  normalized.forEach((file, id) => form.append(`files[${id}]`, new Blob([file.bytes], { type: file.contentType }), file.filename));
  return form;
}

function getRateLimiter(token, apiBase) {
  if (!token) return new RateLimiter();
  const normalizedToken = String(token).replace(/^Bot\s+/i, '');
  const key = `${apiBase}\u0000${createHash('sha256').update(normalizedToken).digest('hex')}`;
  if (!sharedRateLimiters.has(key)) sharedRateLimiters.set(key, new RateLimiter());
  return sharedRateLimiters.get(key);
}

function applicationCommandKey(command) {
  return `${Number(command?.type || 1)}:${String(command?.name || '').toLowerCase()}`;
}

export class DiscordAPIError extends Error {
  constructor(message, status, code, raw) {
    super(message);
    this.name = 'DiscordAPIError';
    this.status = status;
    this.code = code;
    this.raw = raw;
  }
}
//
export class RESTClient {
  /**
   * @param {object} [options]
   * @param {string} [options.token]
   * @param {string} [options.apiBase]
   */
  constructor(options = {}) {
    this.token = options.token || null;
    this.apiBase = options.apiBase || API_BASE;
    this.rateLimiter = getRateLimiter(this.token, this.apiBase);
    this.userAgent = 'DiscordBot (https://github.com/arc-studio, 2026.1.0)';
  }

  setToken(token) {
    this.token = token;
    this.rateLimiter = getRateLimiter(this.token, this.apiBase);
    return this;
  }

  /**
   * @param {string} method
   * @param {string} endpoint
   * @param {object} [options]
   * @param {object} [options.body]
   * @param {object} [options.query]
   * @param {object} [options.headers]
   * @param {boolean} [options.auth=true]
   * @param {number} [options.maxRetries=3]
   * @returns {Promise<any>}
   */
  async request(method, endpoint, options = {}) {
    const {
      body,
      query,
      headers = {},
      auth = true,
      maxRetries = 3
    } = options;

    const routeKey = this.rateLimiter.getRouteKey(endpoint, method);
    let url = endpoint.startsWith('http') ? endpoint : `${this.apiBase}${endpoint}`;

    if (query && Object.keys(query).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          searchParams.append(k, String(v));
        }
      }
      url += (url.includes('?') ? '&' : '?') + searchParams.toString();
    }

    let attempts = 0;

    while (attempts < maxRetries) {
      attempts++;
      await this.rateLimiter.acquire(routeKey);

      const requestHeaders = {
        'User-Agent': this.userAgent,
        ...headers
      };

      if (auth && this.token) {
        requestHeaders['Authorization'] = this.token.startsWith('Bot ')
          ? this.token
          : `Bot ${this.token}`;
      }

      let requestBody = undefined;
      if (body !== undefined && body !== null) {
        if (body instanceof FormData) {
          requestBody = body;
        } else {
          requestHeaders['Content-Type'] = 'application/json';
          requestBody = JSON.stringify(body);
        }
      }

      let response;
      try {
        response = await globalThis.fetch(url, {
          method,
          headers: requestHeaders,
          body: requestBody
        });
      } catch (err) {
        if (attempts >= maxRetries) throw err;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempts));
        continue;
      }

      let parsedData = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          parsedData = await response.json();
        } catch {
          parsedData = null;
        }
      } else if (response.status !== 204) {
        parsedData = await response.text();
      }

      this.rateLimiter.handleHeaders(routeKey, response.headers, response.status, parsedData);

      if (response.status === 429) {
        const retryAfterMs = (parsedData && parsedData.retry_after)
          ? parsedData.retry_after * 1000
          : 1000;
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
        continue;
      }

      if (!response.ok) {
        const errorMsg = parsedData?.message || `Discord API Error: HTTP ${response.status} ${response.statusText}`;
        const errorCode = parsedData?.code || 0;
        throw new DiscordAPIError(errorMsg, response.status, errorCode, parsedData);
      }

      return parsedData;
    }

    throw new Error(`Max retries exceeded for ${method} ${endpoint}`);
  }
//
  getCurrentUser() {
    return this.request('GET', '/users/@me');
  }

  getCurrentApplication() {
    return this.request('GET', '/oauth2/applications/@me');
  }

  getGlobalApplicationCommands(applicationId) {
    if (!applicationId) throw new TypeError('An application ID is required.');
    return this.request('GET', `/applications/${applicationId}/commands`);
  }

  /**
   * @param {string} applicationId
   * @param {Array<object>} commands
   * @returns {Promise<Array<object>>}
   */
  async bulkOverwriteGlobalApplicationCommands(applicationId, commands) {
    if (!applicationId) throw new TypeError('An application ID is required.');
    if (!Array.isArray(commands)) throw new TypeError('Commands must be an array.');
    const seen = new Set();
    const counts = new Map([[1, 0], [2, 0], [3, 0], [4, 0]]);
    for (const command of commands) {
      if (!command || typeof command.name !== 'string' || !command.name.trim()) throw new TypeError('Every application command needs a name.');
      const type = Number(command.type || 1);
      if (!counts.has(type)) throw new TypeError(`Unsupported application command type: ${command.type}`);
      counts.set(type, counts.get(type) + 1);
      if (type === 1) {
        const validName = /^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u.test(command.name)
          && command.name === command.name.toLowerCase();
        const descriptionLength = typeof command.description === 'string' ? Array.from(command.description.trim()).length : 0;
        if (!validName || descriptionLength < 1 || descriptionLength > 100) {
          throw new TypeError(`Slash command "${command.name}" must use a valid 1–32 character lowercase name and a description of 1–100 characters.`);
        }
      }
      const key = applicationCommandKey(command);
      if (seen.has(key)) throw new TypeError(`Duplicate application command: ${command.name}`);
      seen.add(key);
    }
    const typeLimits = new Map([[1, 100], [2, 15], [3, 15], [4, 1]]);
    for (const [type, count] of counts) {
      if (count > typeLimits.get(type)) throw new RangeError(`Discord allows at most ${typeLimits.get(type)} global commands of type ${type}.`);
    }

    const key = String(applicationId);
    let state = commandDeployments.get(key);
    if (!state) {
      state = { lastAttemptAt: 0, created: [], inFlight: false };
      commandDeployments.set(key, state);
    }
    if (state.inFlight) {
      const error = new Error('A command deployment for this application is already in progress.');
      error.status = 429;
      error.retryAfterMs = COMMAND_DEPLOY_COOLDOWN_MS;
      throw error;
    }
    const now = Date.now();
    const retryAfterMs = state.lastAttemptAt + COMMAND_DEPLOY_COOLDOWN_MS - now;
    if (retryAfterMs > 0) {
      const error = new Error(`Command deployment is on cooldown. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`);
      error.status = 429;
      error.retryAfterMs = retryAfterMs;
      throw error;
    }

    state.lastAttemptAt = now;
    state.inFlight = true;
    state.created = state.created.filter((entry) => now - entry.at < COMMAND_CREATE_WINDOW_MS);
    try {
      const existing = await this.getGlobalApplicationCommands(applicationId);
      const existingKeys = new Set((Array.isArray(existing) ? existing : []).map(applicationCommandKey));
      const createCount = commands.filter((command) => !existingKeys.has(applicationCommandKey(command))).length;
      const usedToday = state.created.reduce((total, entry) => total + entry.count, 0);
      if (usedToday + createCount > COMMAND_CREATE_LIMIT) {
        const error = new Error(`This application has reached the safety limit of ${COMMAND_CREATE_LIMIT} new global commands per 24 hours.`);
        error.status = 429;
        error.retryAfterMs = Math.max(1000, COMMAND_CREATE_WINDOW_MS - (now - (state.created[0]?.at || now)));
        throw error;
      }

      const result = await this.request('PUT', `/applications/${applicationId}/commands`, { body: commands });
      if (createCount) state.created.push({ at: Date.now(), count: createCount });
      return result;
    } finally {
      state.inFlight = false;
    }
  }
//
  modifyCurrentUser(data) {
    return this.request('PATCH', '/users/@me', { body: data });
  }

  getCurrentUserGuilds(query) {
    return this.request('GET', '/users/@me/guilds', { query });
  }

  getGuild(guildId) {
    return this.request('GET', `/guilds/${guildId}`);
  }

  getGuildChannels(guildId) {
    return this.request('GET', `/guilds/${guildId}/channels`);
  }

  createGuildChannel(guildId, channel, reason) {
    if (!guildId) throw new TypeError('A guild ID is required.');
    if (!channel || typeof channel.name !== 'string' || !channel.name.trim()) throw new TypeError('A channel name is required.');
    const headers = reason ? { 'X-Audit-Log-Reason': encodeURIComponent(String(reason).slice(0, 512)) } : {};
    return this.request('POST', `/guilds/${guildId}/channels`, { body: channel, headers });
  }

  modifyChannel(channelId, changes, reason) {
    if (!channelId) throw new TypeError('A channel ID is required.');
    const headers = reason ? { 'X-Audit-Log-Reason': encodeURIComponent(String(reason).slice(0, 512)) } : {};
    return this.request('PATCH', `/channels/${channelId}`, { body: changes, headers });
  }

  deleteChannel(channelId, reason) {
    if (!channelId) throw new TypeError('A channel ID is required.');
    const headers = reason ? { 'X-Audit-Log-Reason': encodeURIComponent(String(reason).slice(0, 512)) } : {};
    return this.request('DELETE', `/channels/${channelId}`, { headers });
  }

  setVoiceChannelStatus(channelId, status, reason) {
    if (!channelId) throw new TypeError('A channel ID is required.');
    const value = status == null ? null : String(status);
    if (value && value.length > 500) throw new RangeError('Voice channel status must be 500 characters or fewer.');
    const headers = reason ? { 'X-Audit-Log-Reason': encodeURIComponent(String(reason).slice(0, 512)) } : {};
    return this.request('PUT', `/channels/${channelId}/voice-status`, { body: { status: value }, headers });
  }

  getGuildRoles(guildId) {
    if (!guildId) throw new TypeError('A guild ID is required.');
    return this.request('GET', `/guilds/${guildId}/roles`);
  }

  createGuildRole(guildId, role, reason) {
    if (!guildId) throw new TypeError('A guild ID is required.');
    const headers = reason ? { 'X-Audit-Log-Reason': encodeURIComponent(String(reason).slice(0, 512)) } : {};
    return this.request('POST', `/guilds/${guildId}/roles`, { body: role, headers });
  }

  addGuildMemberRole(guildId, userId, roleId, reason) {
    if (!guildId || !userId || !roleId) throw new TypeError('Guild, user, and role IDs are required.');
    const headers = reason ? { 'X-Audit-Log-Reason': encodeURIComponent(String(reason).slice(0, 512)) } : {};
    return this.request('PUT', `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { headers });
  }

  removeGuildMemberRole(guildId, userId, roleId, reason) {
    if (!guildId || !userId || !roleId) throw new TypeError('Guild, user, and role IDs are required.');
    const headers = reason ? { 'X-Audit-Log-Reason': String(reason).slice(0, 512) } : {};
    return this.request('DELETE', `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { headers });
  }

  modifyGuildMember(guildId, userId, changes, reason) {
    if (!guildId || !userId) throw new TypeError('Guild and user IDs are required.');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new TypeError('Member changes must be an object.');
    const headers = reason ? { 'X-Audit-Log-Reason': encodeURIComponent(String(reason).slice(0, 512)) } : {};
    return this.request('PATCH', `/guilds/${guildId}/members/${userId}`, { body: changes, headers });
  }

  removeGuildMember(guildId, userId, reason) {
    if (!guildId || !userId) throw new TypeError('Guild and user IDs are required.');
    const headers = reason ? { 'X-Audit-Log-Reason': encodeURIComponent(String(reason).slice(0, 512)) } : {};
    return this.request('DELETE', `/guilds/${guildId}/members/${userId}`, { headers });
  }

  banGuildMember(guildId, userId, { deleteMessageSeconds = 0 } = {}, reason) {
    if (!guildId || !userId) throw new TypeError('Guild and user IDs are required.');
    const seconds = Math.max(0, Math.min(604800, Math.trunc(Number(deleteMessageSeconds) || 0)));
    const headers = reason ? { 'X-Audit-Log-Reason': encodeURIComponent(String(reason).slice(0, 512)) } : {};
    return this.request('PUT', `/guilds/${guildId}/bans/${userId}`, { body: { delete_message_seconds: seconds }, headers });
  }

  unbanGuildMember(guildId, userId, reason) {
    if (!guildId || !userId) throw new TypeError('Guild and user IDs are required.');
    const headers = reason ? { 'X-Audit-Log-Reason': encodeURIComponent(String(reason).slice(0, 512)) } : {};
    return this.request('DELETE', `/guilds/${guildId}/bans/${userId}`, { headers });
  }

  getGuildEmojis(guildId) {
    return this.request('GET', `/guilds/${guildId}/emojis`);
  }

  createGuildEmoji(guildId, { name, image, roles = [] }) {
    return this.request('POST', `/guilds/${guildId}/emojis`, {
      body: { name, image, roles }
    });
  }

  deleteGuildEmoji(guildId, emojiId) {
    return this.request('DELETE', `/guilds/${guildId}/emojis/${emojiId}`);
  }

  getApplicationEmojis(applicationId) {
    return this.request('GET', `/applications/${applicationId}/emojis`);
  }

  createApplicationEmoji(applicationId, { name, image }) {
    return this.request('POST', `/applications/${applicationId}/emojis`, {
      body: { name, image }
    });
  }

  deleteApplicationEmoji(applicationId, emojiId) {
    return this.request('DELETE', `/applications/${applicationId}/emojis/${emojiId}`);
  }

  createMessage(channelId, payload) {
    if (typeof payload === 'string') return this.request('POST', `/channels/${channelId}/messages`, { body: { content: payload } });
    return this.request('POST', `/channels/${channelId}/messages`, { body: buildMultipartBody(payload || {}) });
  }

  editMessage(channelId, messageId, payload) {
    if (typeof payload === 'string') return this.request('PATCH', `/channels/${channelId}/messages/${messageId}`, { body: { content: payload } });
    return this.request('PATCH', `/channels/${channelId}/messages/${messageId}`, { body: buildMultipartBody(payload || {}) });
  }

  createInteractionResponse(interactionId, interactionToken, responseData) {
    const body = responseData && typeof responseData === 'object' ? { ...responseData } : responseData;
    if (body?.data && typeof body.data === 'object') body.data = buildMultipartBody(body.data);
    return this.request('POST', `/interactions/${interactionId}/${interactionToken}/callback`, {
      body,
      auth: false
    });
  }

  deferInteractionReply(interactionId, interactionToken, { ephemeral = false } = {}) {
    return this.createInteractionResponse(interactionId, interactionToken, {
      type: 5,
      ...(ephemeral ? { data: { flags: 64 } } : {})
    });
  }

  deferInteractionUpdate(interactionId, interactionToken) {
    return this.createInteractionResponse(interactionId, interactionToken, { type: 6 });
  }

  editOriginalInteractionResponse(applicationId, interactionToken, payload) {
    if (!applicationId || !interactionToken) throw new TypeError('Editing an interaction response needs an application ID and interaction token.');
    return this.request('PATCH', `/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
      body: buildMultipartBody(payload || {}),
      auth: false
    });
  }

  getGatewayBot() {
    return this.request('GET', '/gateway/bot');
  }
}
