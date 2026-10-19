import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CryptoEngine } from '../src/security/CryptoEngine.js';
//
describe('CryptoEngine Test Suite', () => {
  test('AES-256-GCM authenticated encryption and decryption', () => {
    const secretMessage = 'TopSecretBotToken_2026_xyz';
    const encrypted = CryptoEngine.encrypt(secretMessage);

    assert.ok(CryptoEngine.isEncrypted(encrypted));
    assert.ok(encrypted.startsWith('arc:v1:aes-256-gcm:'));

    const decrypted = CryptoEngine.decrypt(encrypted);
    assert.equal(decrypted, secretMessage);
  });

  test('Envelope uniqueness: two encryptions of same plaintext produce different IVs and ciphertexts', () => {
    const text = 'IdenticalPlaintext';
    const enc1 = CryptoEngine.encrypt(text);
    const enc2 = CryptoEngine.encrypt(text);

    assert.notEqual(enc1, enc2);
    assert.equal(CryptoEngine.decrypt(enc1), text);
    assert.equal(CryptoEngine.decrypt(enc2), text);
  });

  test('Custom passphrase encryption and decryption', () => {
    const text = 'CustomPassphraseVaultData';
    const customPass = 'ultra-secure-user-custom-key-9988';
    const encrypted = CryptoEngine.encrypt(text, customPass);

    assert.equal(CryptoEngine.decrypt(encrypted, customPass), text);

    assert.throws(() => {
      CryptoEngine.decrypt(encrypted, 'wrong-password-123');
    }, /Cryptographic verification failed/);
  });

  test('Additional Authenticated Data (AAD) binding', () => {
    const payload = 'ConfidentialDataBoundToGuildId';
    const guildId = '123456789012345678';
    const encrypted = CryptoEngine.encrypt(payload, null, guildId);

    assert.equal(CryptoEngine.decrypt(encrypted, null, guildId), payload);

    assert.throws(() => {
      CryptoEngine.decrypt(encrypted, null, '999999999999999999');
    }, /Cryptographic verification failed/);
  });

  test('Ciphertext tampering is detected and rejected by authentication tag', () => {
    const encrypted = CryptoEngine.encrypt('DoNotTamperWitMe');
    const parts = encrypted.split(':');

    parts[6] = parts[6].slice(0, -2) + (parts[6].slice(-2) === 'aa' ? 'bb' : 'aa');
    const tampered = parts.join(':');

    assert.throws(() => {
      CryptoEngine.decrypt(tampered);
    }, /Cryptographic verification failed/);
  });

  test('JSON Object encryption & decryption', () => {
    const config = {
      botToken: 'token_abc123',
      webhookUrl: 'https://discord.com/api/webhooks/123/xyz',
      permissions: ['*']
    };

    const encrypted = CryptoEngine.encryptObject(config);
    const restored = CryptoEngine.decryptObject(encrypted);
    assert.deepEqual(restored, config);
  });

  test('HMAC and Constant-Time verification', () => {
    const data = 'WebhookPayloadBody';
    const secret = 'webhook-signing-secret';
    const hmac = CryptoEngine.hmac(data, secret);

    assert.equal(CryptoEngine.verifyHmac(data, secret, hmac), true);
    assert.equal(CryptoEngine.verifyHmac(data, secret, 'invalid-signature-hex'), false);
    assert.equal(CryptoEngine.verifyHmac(data, 'wrong-secret', hmac), false);
  });

  test('Cryptographic token, PIN generation and masking', () => {
    const token = CryptoEngine.randomToken(32, 'hex');
    assert.equal(token.length, 64);

    const base64UrlToken = CryptoEngine.randomToken(32, 'base64url');
    assert.ok(base64UrlToken.length > 30);

    const pin = CryptoEngine.randomPin(6);
    assert.equal(pin.length, 6);
    assert.match(pin, /^\d{6}$/);

    const masked = CryptoEngine.mask('MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=');
    assert.ok(masked.includes('****'));
    assert.equal(masked.startsWith('MTIz'), true);
  });
});
