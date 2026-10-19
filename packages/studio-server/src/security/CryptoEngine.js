import crypto from 'node:crypto';
import { serverConfig } from '../config.js';
//
export class CryptoEngine {
  static ALGORITHM = 'aes-256-gcm';
  static PREFIX = 'arc:v1:aes-256-gcm';
  static PBKDF2_ITERATIONS = 100_000;
  static KEY_LENGTH = 32; // 256 bits
  static IV_LENGTH = 12; // 96 bits for GCM
  static SALT_LENGTH = 16; // 128 bits
  static TAG_LENGTH = 16; // 128 bits

  /**
   * Derive a 256-bit encryption key from a passphrase and salt using PBKDF2-HMAC-SHA512
   * @param {string} passphrase
   * @param {Buffer} salt
   * @returns {Buffer}
   */
  static deriveKey(passphrase, salt) {
    const secret = passphrase || serverConfig.sessionSecret;
    return crypto.pbkdf2Sync(
      secret,
      salt,
      this.PBKDF2_ITERATIONS,
      this.KEY_LENGTH,
      'sha512'
    );
  }

  /**
   * Encrypt plaintext using AES-256-GCM with authenticated data
   * Produces formatted string: arc:v1:aes-256-gcm:<salt>:<iv>:<tag>:<ciphertext>
   * @param {string|Buffer} plaintext
   * @param {string} [passphrase] Custom passphrase or defaults to serverConfig.sessionSecret
   * @param {string} [aad] Optional Additional Authenticated Data
   * @returns {string} Encrypted envelope string
   */
  static encrypt(plaintext, passphrase = null, aad = null) {
    if (plaintext === null || plaintext === undefined) {
      throw new TypeError('Plaintext cannot be null or undefined');
    }

    const textBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8');
    const salt = crypto.randomBytes(this.SALT_LENGTH);
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const key = this.deriveKey(passphrase, salt);

    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.TAG_LENGTH
    });

    if (aad) {
      cipher.setAAD(Buffer.from(String(aad), 'utf8'));
    }

    const encrypted = Buffer.concat([cipher.update(textBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      this.PREFIX,
      salt.toString('hex'),
      iv.toString('hex'),
      authTag.toString('hex'),
      encrypted.toString('hex')
    ].join(':');
  }

  /**
   * Decrypt AES-256-GCM envelope
   * @param {string} envelope Formatted arc:v1:aes-256-gcm:<salt>:<iv>:<tag>:<ciphertext>
   * @param {string} [passphrase] Custom passphrase or defaults to serverConfig.sessionSecret
   * @param {string} [aad] Optional Additional Authenticated Data
   * @returns {string} Decrypted plaintext string
   */
  static decrypt(envelope, passphrase = null, aad = null) {
    if (!this.isEncrypted(envelope)) {
      throw new Error('Invalid encryption envelope format. Expected arc:v1:aes-256-gcm:...');
    }

    const parts = envelope.split(':');
    if (parts.length !== 7) {
      throw new Error('Malformed encryption envelope structure.');
    }

    // parts ['arc', 'v1', 'aes-256-gcm', saltHex, ivHex, tagHex, cipherHex]
    const salt = Buffer.from(parts[3], 'hex');
    const iv = Buffer.from(parts[4], 'hex');
    const authTag = Buffer.from(parts[5], 'hex');
    const ciphertext = Buffer.from(parts[6], 'hex');

    if (authTag.length !== this.TAG_LENGTH) {
      throw new Error(`Invalid authentication tag length: expected ${this.TAG_LENGTH} bytes`);
    }

    const key = this.deriveKey(passphrase, salt);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.TAG_LENGTH
    });

    decipher.setAuthTag(authTag);

    if (aad) {
      decipher.setAAD(Buffer.from(String(aad), 'utf8'));
    }

    try {
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      throw new Error('Cryptographic verification failed: Authentication tag mismatch or corrupted ciphertext.');
    }
  }

  /**
   * Encrypt a JSON object
   * @param {object} obj
   * @param {string} [passphrase]
   * @param {string} [aad]
   * @returns {string}
   */
  static encryptObject(obj, passphrase = null, aad = null) {
    return this.encrypt(JSON.stringify(obj), passphrase, aad);
  }

  /**
   * Decrypt a JSON object
   * @param {string} envelope
   * @param {string} [passphrase]
   * @param {string} [aad]
   * @returns {object}
   */
  static decryptObject(envelope, passphrase = null, aad = null) {
    const jsonStr = this.decrypt(envelope, passphrase, aad);
    return JSON.parse(jsonStr);
  }

  /**
   * Check if a string is an ARC encrypted envelope
   * @param {string} str
   * @returns {boolean}
   */
  static isEncrypted(str) {
    return typeof str === 'string' && str.startsWith(this.PREFIX + ':');
  }

  /**
   * Cryptographic Hash (SHA-256, SHA-512, MD5)
   * @param {string|Buffer} data
   * @param {string} [algorithm='sha256']
   * @returns {string} Hex digest
   */
  static hash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Compute HMAC
   * @param {string|Buffer} data
   * @param {string} key
   * @param {string} [algorithm='sha256']
   * @returns {string} Hex signature
   */
  static hmac(data, key, algorithm = 'sha256') {
    return crypto.createHmac(algorithm, key).update(data).digest('hex');
  }

  /**
   * Verify HMAC
   * @param {string|Buffer} data
   * @param {string} key
   * @param {string} signature
   * @param {string} [algorithm='sha256']
   * @returns {boolean}
   */
  static verifyHmac(data, key, signature, algorithm = 'sha256') {
    if (!signature || typeof signature !== 'string') return false;
    try {
      const expected = this.hmac(data, key, algorithm);
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  /**
   * Generate high-entropy cryptographic token
   * @param {number} [bytes=32]
   * @param {'hex'|'base64url'} [encoding='hex']
   * @returns {string}
   */
  static randomToken(bytes = 32, encoding = 'hex') {
    const buf = crypto.randomBytes(bytes);
    return encoding === 'base64url' ? buf.toString('base64url') : buf.toString('hex');
  }

  /**
   * Generate cryptographic numeric PIN
   * @param {number} [digits=6]
   * @returns {string}
   */
  static randomPin(digits = 6) {
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    return crypto.randomInt(min, max + 1).toString();
  }

  /**
   * Secure Token Mask
   * Converts sensitive secrets into masked display tokens (e.g., MTIz...****...89xY)
   * @param {string} secret
   * @param {number} [visibleLead=4]
   * @param {number} [visibleTrail=4]
   * @returns {string}
   */
  static mask(secret, visibleLead = 4, visibleTrail = 4) {
    if (!secret || typeof secret !== 'string') return '****';
    if (secret.length <= visibleLead + visibleTrail + 4) return '********';
    const head = secret.slice(0, visibleLead);
    const tail = secret.slice(-visibleTrail);
    return `${head}...****...${tail}`;
  }
}
