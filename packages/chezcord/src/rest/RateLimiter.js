import { EventEmitter } from 'node:events';
/**
 * Leaky Bucket Rate Limiter
 */
export class RateLimiter extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, { remaining: number, resetAt: number, queue: Array<Function> }>} */
    this.buckets = new Map();
    this.globalResetAt = 0;
    this.rateLimitedUntil = 0;
    /** @type {Array<Function>} */
    this.globalQueue = [];
    this.isProcessingGlobal = false;
  }

  /**
   * derive a generalized bucket key from a Discord API path
   * @param {string} route
   * @param {string} method
   * @returns {string}
   */
  getRouteKey(route, method) {
    const cleanRoute = route
      .split('?')[0]
      .replace(/\/([0-9]{17,20})/g, '/:id');
    return `${method.toUpperCase()}:${cleanRoute}`;
  }

  /**
   * wait until rate limit allowance permits request exec
   * @param {string} routeKey
   * @returns {Promise<void>}
   */
  async acquire(routeKey) {
    let bucket = this.buckets.get(routeKey);
    if (!bucket) {
      bucket = { remaining: 1, resetAt: 0, queue: [] };
      this.buckets.set(routeKey, bucket);
    }

    while (true) {
      const now = Date.now();
      const blockedUntil = Math.max(this.rateLimitedUntil, this.globalResetAt);
      if (blockedUntil > now) {
        await new Promise((resolve) => setTimeout(resolve, blockedUntil - now));
        continue;
      }

      if (bucket.remaining <= 0 && bucket.resetAt > now) {
        const delay = bucket.resetAt - now;
        await new Promise((resolve) => {
          bucket.queue.push(resolve);
          setTimeout(() => {
            const idx = bucket.queue.indexOf(resolve);
            if (idx !== -1) bucket.queue.splice(idx, 1);
            resolve();
          }, delay);
        });
        continue;
      }

      bucket.remaining = Math.max(0, bucket.remaining - 1);
      return;
    }
  }

  /**
   * update bucket state based on Discord API res headers
   * @param {string} routeKey
   * @param {Headers} headers
   * @param {number} status
   * @param {any} body
   */
  handleHeaders(routeKey, headers, status, body) {
    const isGlobal = headers.get('x-ratelimit-global') === 'true';
    const retryAfter = parseFloat(headers.get('retry-after') || '0') * 1000;
    const remaining = parseInt(headers.get('x-ratelimit-remaining') || '1', 10);
    const resetAfter = parseFloat(headers.get('x-ratelimit-reset-after') || '0') * 1000;

    if (status === 429) {
      const bodyWaitMs = Number.isFinite(body?.retry_after) ? body.retry_after * 1000 : 0;
      const waitMs = Math.max(1000, bodyWaitMs || (Number.isFinite(retryAfter) ? retryAfter : 0));

      this.rateLimitedUntil = Math.max(this.rateLimitedUntil, Date.now() + waitMs);
      if (isGlobal || (body && body.global)) {
        this.globalResetAt = Date.now() + waitMs;
      } else {
        let bucket = this.buckets.get(routeKey);
        if (!bucket) {
          bucket = { remaining: 0, resetAt: 0, queue: [] };
          this.buckets.set(routeKey, bucket);
        }
        bucket.remaining = 0;
        bucket.resetAt = Date.now() + waitMs;
      }
      this.emit('rateLimit', {
        route: routeKey,
        scope: isGlobal || Boolean(body?.global) ? 'global' : 'route',
        retryAfterMs: waitMs,
        rateLimitedUntil: this.rateLimitedUntil
      });
      return;
    }

    if (headers.has('x-ratelimit-remaining')) {
      let bucket = this.buckets.get(routeKey);
      if (!bucket) {
        bucket = { remaining: 1, resetAt: 0, queue: [] };
        this.buckets.set(routeKey, bucket);
      }
      bucket.remaining = remaining;
      bucket.resetAt = Date.now() + resetAfter;
    }
  }

  getStatus() {
    const now = Date.now();
    const activeUntil = Math.max(this.rateLimitedUntil, this.globalResetAt);
    return {
      limited: activeUntil > now,
      rateLimitedUntil: activeUntil > now ? activeUntil : 0,
      remainingMs: Math.max(0, activeUntil - now)
    };
  }
}
