import { CryptoEngine } from '../../../security/CryptoEngine.js';
//
const cryptoHandlers = Object.freeze({
  action_crypto_hash(node, { resolveInput, setOutput, log }) {
    const data = String(resolveInput('data', node.data?.data || ''));
    const algorithm = String(resolveInput('algorithm', node.data?.algorithm || 'sha256')).toLowerCase();
    const hash = CryptoEngine.hash(data, algorithm);
    setOutput('hash', hash);
    log(`[Crypto Hash] Computed ${algorithm.toUpperCase()} hash for ${data.length} bytes: ${hash.slice(0, 16)}...`);
  },
  action_crypto_hmac(node, { resolveInput, setOutput, log }) {
    const data = String(resolveInput('data', node.data?.data || ''));
    const secret = String(resolveInput('secret', node.data?.secret || ''));
    const algorithm = String(resolveInput('algorithm', node.data?.algorithm || 'sha256')).toLowerCase();
    const signature = CryptoEngine.hmac(data, secret, algorithm);
    setOutput('signature', signature);
    log(`[Crypto HMAC] Signed payload with ${algorithm.toUpperCase()}: ${signature.slice(0, 16)}...`);
  },
  action_crypto_verify_hmac(node, { resolveInput, setOutput, log }) {
    const data = String(resolveInput('data', node.data?.data || ''));
    const secret = String(resolveInput('secret', node.data?.secret || ''));
    const signature = String(resolveInput('signature', node.data?.signature || ''));
    const isValid = CryptoEngine.verifyHmac(data, secret, signature);
    setOutput('isValid', isValid);
    log(`[Crypto Verify HMAC] Verification: ${isValid ? 'VALID' : 'INVALID'}`);
  },
  action_crypto_encrypt(node, { resolveInput, setOutput, log }) {
    const plaintext = String(resolveInput('plaintext', node.data?.plaintext || ''));
    const customPass = resolveInput('passphrase', node.data?.passphrase || '') || null;
    const ciphertext = CryptoEngine.encrypt(plaintext, customPass);
    setOutput('ciphertext', ciphertext);
    log(`[Crypto Encrypt] Encrypted ${plaintext.length} chars to AES-256-GCM envelope`);
  },
  action_crypto_decrypt(node, { resolveInput, setOutput, log }) {
    const ciphertext = String(resolveInput('ciphertext', node.data?.ciphertext || ''));
    const customPass = resolveInput('passphrase', node.data?.passphrase || '') || null;
    try {
      const plaintext = CryptoEngine.decrypt(ciphertext, customPass);
      setOutput('plaintext', plaintext);
      log('[Crypto Decrypt] Successfully decrypted AES-256-GCM envelope');
    } catch (error) {
      log(`[Crypto Decrypt] Failed: ${error.message}`);
    }
  },
  action_crypto_random(node, { resolveInput, setOutput, log }) {
    const type = String(resolveInput('type', node.data?.type || 'hex')).toLowerCase();
    const token = type === 'pin'
      ? CryptoEngine.randomPin(6)
      : type === 'base64url'
        ? CryptoEngine.randomToken(32, 'base64url')
        : CryptoEngine.randomToken(32, 'hex');
    setOutput('token', token);
    log(`[Crypto Random] Generated secure token (${type}): ${token.slice(0, 10)}...`);
  }
});

export function executeCryptoNode(node, runtime) {
  const handler = cryptoHandlers[node?.type];
  if (!handler) return false;
  handler(node, runtime);
  return true;
}
