import { createHmac, randomBytes } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_OPTIONS = new Set([30, 90, 180, 365, 'forever']);
//
export const DEFAULT_STATISTICS_SETTINGS = Object.freeze({
  enabled: true,
  retentionDays: 30,
  commandUsage: true,
  uniqueUsers: true,
  returningUsers: true
});

/**
 * Bounded slash-command usage aggregates.
 * User IDs are HMACed with a random local salt and are never retained as suppliedss
 */
export class CommandStatistics {
  constructor({ settings = {}, state = {}, onChange = () => {} } = {}) {
    this.onChange = onChange;
    this.settings = normalizeSettings({ ...DEFAULT_STATISTICS_SETTINGS, ...(state.settings || {}), ...settings });
    this.salt = typeof state.salt === 'string' && /^[a-f0-9]{64}$/i.test(state.salt) ? state.salt : randomBytes(32).toString('hex');
    this.daily = state.daily && typeof state.daily === 'object' && !Array.isArray(state.daily) ? state.daily : {};
    this.uniqueUsers = state.uniqueUsers && typeof state.uniqueUsers === 'object' && !Array.isArray(state.uniqueUsers) ? state.uniqueUsers : {};
    this.returningUsers = state.returningUsers && typeof state.returningUsers === 'object' && !Array.isArray(state.returningUsers) ? state.returningUsers : {};
    this.prune();
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(patch = {}) {
    const previous = this.settings;
    this.settings = normalizeSettings({ ...previous, ...patch });
    if (!this.settings.enabled || !this.settings.commandUsage) this.daily = {};
    if (!this.settings.enabled || !this.settings.uniqueUsers) this.uniqueUsers = {};
    if (!this.settings.enabled || !this.settings.returningUsers) this.returningUsers = {};
    this.prune();
    this.onChange();
    return this.getSettings();
  }

  recordCommand({ name, userId, timestamp = Date.now() } = {}) {
    if (!this.settings.enabled) return false;
    const command = normalizeCommandName(name);
    const at = Number(timestamp);
    if (!command || !Number.isFinite(at)) return false;

    const date = new Date(at);
    if (Number.isNaN(date.getTime())) return false;
    if (this.settings.commandUsage) {
      const day = date.toISOString().slice(0, 10);
      this.daily[day] ||= {};
      this.daily[day][command] = (Number(this.daily[day][command]) || 0) + 1;
    }

    if (userId !== undefined && userId !== null && String(userId) && (this.settings.uniqueUsers || this.settings.returningUsers)) {
      const userHash = createHmac('sha256', Buffer.from(this.salt, 'hex')).update(String(userId)).digest('hex');
      if (this.settings.uniqueUsers) {
        this.uniqueUsers[userHash] ||= { lastSeen: at, commands: {} };
        const user = this.uniqueUsers[userHash];
        user.lastSeen = at;
        user.commands ||= {};
        user.commands[command] = at;
      }
      if (this.settings.returningUsers) {
        this.returningUsers[userHash] ||= { lastSeen: at, daily: {}, commands: {} };
        const user = this.returningUsers[userHash];
        user.lastSeen = at;
        const day = date.toISOString().slice(0, 10);
        user.daily ||= {};
        user.daily[day] = (Number(user.daily[day]) || 0) + 1;
        user.commands ||= {};
        user.commands[command] ||= {};
        user.commands[command][day] = (Number(user.commands[command][day]) || 0) + 1;
      }
    }

    this.prune();
    this.onChange();
    return true;
  }

  getSummary({ days = this.settings.retentionDays } = {}) {
    const rangeDays = normalizeRange(days, this.settings.retentionDays);
    const cutoff = getCutoff(rangeDays);
    const tracking = this.getTrackingState();
    const commands = this.getCommandCounts(cutoff).map(([name, uses]) => ({
      name,
      uses: tracking.commandUsage ? uses : null,
      uniqueUsers: tracking.uniqueUsers ? this.countUsersForCommand(this.uniqueUsers, name, cutoff) : null,
      returningUsers: tracking.returningUsers ? this.countUsersForCommand(this.returningUsers, name, cutoff, true) : null
    })).sort((a, b) => (b.uses || 0) - (a.uses || 0) || a.name.localeCompare(b.name));
    const totalUses = tracking.commandUsage ? commands.reduce((total, command) => total + (command.uses || 0), 0) : null;
    return {
      rangeDays,
      retentionDays: this.settings.retentionDays,
      tracking,
      totalUses,
      uniqueUsers: tracking.uniqueUsers ? this.countUsers(this.uniqueUsers, cutoff) : null,
      returningUsers: tracking.returningUsers ? this.countUsers(this.returningUsers, cutoff, true) : null,
      commands,
      generatedAt: new Date().toISOString()
    };
  }

  getCommand(name, { days = this.settings.retentionDays } = {}) {
    const command = normalizeCommandName(name);
    const summary = this.getSummary({ days });
    const entry = summary.commands.find((item) => item.name === command) || {
      name: command, uses: summary.tracking.commandUsage ? 0 : null,
      uniqueUsers: summary.tracking.uniqueUsers ? 0 : null,
      returningUsers: summary.tracking.returningUsers ? 0 : null
    };
    const cutoff = getCutoff(summary.rangeDays);
    const daily = Object.entries(this.daily).filter(([day]) => day >= cutoff.day).sort(([a], [b]) => a.localeCompare(b)).map(([day, counts]) => ({ day, uses: Number(counts?.[command]) || 0 }));
    return { ...entry, rangeDays: summary.rangeDays, retentionDays: summary.retentionDays, tracking: summary.tracking, daily };
  }

  exportState() {
    return {
      settings: this.getSettings(),
      salt: this.salt,
      daily: this.daily,
      uniqueUsers: this.uniqueUsers,
      returningUsers: this.returningUsers
    };
  }

  getTrackingState() {
    const enabled = this.settings.enabled;
    return {
      commandUsage: enabled && this.settings.commandUsage,
      uniqueUsers: enabled && this.settings.uniqueUsers,
      returningUsers: enabled && this.settings.returningUsers
    };
  }

  getCommandCounts(cutoff) {
    const totals = new Map();
    for (const [day, counts] of Object.entries(this.daily)) {
      if (day < cutoff.day || !counts || typeof counts !== 'object') continue;
      for (const [name, count] of Object.entries(counts)) totals.set(name, (totals.get(name) || 0) + (Number(count) || 0));
    }
    if (this.settings.uniqueUsers) {
      for (const user of Object.values(this.uniqueUsers)) {
        for (const [name, lastSeen] of Object.entries(user?.commands || {})) {
          if (Number(lastSeen) >= cutoff.timestamp && !totals.has(name)) totals.set(name, 0);
        }
      }
    }
    if (this.settings.returningUsers) {
      for (const user of Object.values(this.returningUsers)) {
        for (const [name, count] of Object.entries(user?.commands || {})) {
          if (Number(user?.lastSeen) >= cutoff.timestamp && !totals.has(name)) totals.set(name, 0);
        }
      }
    }
    return [...totals.entries()];
  }

  countUsers(source, cutoff, returningOnly = false) {
    return Object.values(source).filter((user) => {
      if (Number(user?.lastSeen) < cutoff.timestamp) return false;
      if (!returningOnly) return true;
      return Object.entries(user?.daily || {}).reduce((total, [day, count]) => total + (day >= cutoff.day ? Number(count) || 0 : 0), 0) > 1;
    }).length;
  }

  countUsersForCommand(source, command, cutoff, returningOnly = false) {
    return Object.values(source).filter((user) => {
      if (returningOnly) return Number(user?.lastSeen) >= cutoff.timestamp && Object.entries(user?.commands?.[command] || {}).reduce((total, [day, count]) => total + (day >= cutoff.day ? Number(count) || 0 : 0), 0) > 1;
      const seen = source === this.uniqueUsers ? user?.commands?.[command] : user?.lastSeen;
      return Number(seen) >= cutoff.timestamp;
    }).length;
  }

  prune(now = Date.now()) {
    const retention = this.settings.retentionDays;
    if (retention === 'forever') return;
    const cutoffTimestamp = now - retention * DAY_MS;
    const cutoffDay = new Date(cutoffTimestamp).toISOString().slice(0, 10);
    for (const day of Object.keys(this.daily)) if (day < cutoffDay) delete this.daily[day];
    for (const [hash, user] of Object.entries(this.uniqueUsers)) if (Number(user?.lastSeen) < cutoffTimestamp) delete this.uniqueUsers[hash];
    for (const [hash, user] of Object.entries(this.returningUsers)) {
      if (Number(user?.lastSeen) < cutoffTimestamp) { delete this.returningUsers[hash]; continue; }
      for (const day of Object.keys(user.daily || {})) if (day < cutoffDay) delete user.daily[day];
      for (const [command, counts] of Object.entries(user.commands || {})) {
        for (const day of Object.keys(counts || {})) if (day < cutoffDay) delete counts[day];
        if (!Object.keys(counts || {}).length) delete user.commands[command];
      }
    }
  }
}

function normalizeSettings(settings) {
  const retentionDays = RETENTION_OPTIONS.has(settings.retentionDays) ? settings.retentionDays : 30;
  return {
    enabled: settings.enabled !== false,
    retentionDays,
    commandUsage: settings.commandUsage !== false,
    uniqueUsers: settings.uniqueUsers !== false,
    returningUsers: settings.returningUsers !== false
  };
}

function normalizeRange(value, fallback) {
  if (value === 'forever') return 'forever';
  const days = Number(value);
  if ([30, 90, 180, 365].includes(days)) return days;
  return fallback;
}

function getCutoff(days) {
  const timestamp = days === 'forever' ? 0 : Date.now() - days * DAY_MS;
  return { timestamp, day: timestamp ? new Date(timestamp).toISOString().slice(0, 10) : '0000-00-00' };
}

function normalizeCommandName(name) {
  return typeof name === 'string' ? name.trim().replace(/^\//, '').toLowerCase().slice(0, 100) : '';
}
