import crypto from 'node:crypto';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
//
export class InteractionSecurity {
  /**
   * Verify Discord interaction HTTP req signature (Ed25519)
   * @param {object} params
   * @param {string} params.publicKey Application public key (hex string)
   * @param {string} params.signature X-Signature-Ed25519 header (hex string)
   * @param {string} params.timestamp X-Signature-Timestamp header
   * @param {string|Buffer} params.rawBody raw incoming request body
   * @returns {boolean} True if signature valid
   */
  static verifyInteraction({ publicKey, signature, timestamp, rawBody }) {
    if (!publicKey || !signature || !timestamp || rawBody === undefined) {
      return false;
    }

    try {
      const pubKeyBuf = Buffer.from(publicKey, 'hex');
      const sigBuf = Buffer.from(signature, 'hex');
      const timestampBuf = Buffer.from(String(timestamp), 'utf8');
      const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');

      if (pubKeyBuf.length !== 32 || sigBuf.length !== 64) {
        return false;
      }

      const spkiKey = Buffer.concat([ED25519_SPKI_PREFIX, pubKeyBuf]);
      const dataToVerify = Buffer.concat([timestampBuf, bodyBuf]);

      return crypto.verify(
        null,
        dataToVerify,
        {
          key: spkiKey,
          format: 'der',
          type: 'spki'
        },
        sigBuf
      );
    } catch {
      return false;
    }
  }

  /**
   * Helper to sign an interaction payload (MockGateway/automated tests)
   * @param {crypto.KeyObject|string} privateKey
   * @param {string} timestamp
   * @param {string|Buffer} rawBody
   * @returns {string} Hex signature
   */
  static signInteraction(privateKey, timestamp, rawBody) {
    const timestampBuf = Buffer.from(String(timestamp), 'utf8');
    const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
    const dataToSign = Buffer.concat([timestampBuf, bodyBuf]);

    return crypto.sign(null, dataToSign, privateKey).toString('hex');
  }
}
