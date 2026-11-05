import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decrypt,
  encrypt,
  hashPassword,
  hmacSha256Hex,
  verifyHmacSha256Hex,
  verifyPassword,
} from '../src/lib/crypto.js';

const KEY = Buffer.alloc(32, 7).toString('base64');

test('scrypt password hash verifies and rejects wrong passwords', () => {
  const hash = hashPassword('correct horse battery 9');
  assert.match(hash, /^scrypt\$32768\$8\$1\$/);
  assert.equal(verifyPassword('correct horse battery 9', hash), true);
  assert.equal(verifyPassword('wrong password 123', hash), false);
});

test('AES-256-GCM round trip and tamper detection', () => {
  const ciphertext = encrypt('provider-access-token', KEY);
  assert.equal(decrypt(ciphertext, KEY), 'provider-access-token');
  const parts = ciphertext.split('.');
  const tag = Buffer.from(parts[2], 'base64');
  tag[0] ^= 1;
  parts[2] = tag.toString('base64');
  assert.throws(() => decrypt(parts.join('.'), KEY));
});

test('HMAC verification is constant-time and rejects mismatches', () => {
  const signature = hmacSha256Hex('shared-secret', '{"hello":"world"}');
  assert.equal(verifyHmacSha256Hex('shared-secret', '{"hello":"world"}', signature), true);
  assert.equal(verifyHmacSha256Hex('shared-secret', '{"hello":"tampered"}', signature), false);
  assert.equal(verifyHmacSha256Hex('other-secret', '{"hello":"world"}', signature), false);
});
