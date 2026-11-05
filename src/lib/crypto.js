import crypto from 'node:crypto';
import fs from 'node:fs';

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const MAXMEM = 128 * 1024 * 1024;

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hmacSha256Hex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Still compare to reduce accidental early exits on length, then fail.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyHmacSha256Hex(secret, value, providedHex) {
  if (!providedHex) return false;
  const expected = hmacSha256Hex(secret, value);
  return timingSafeEqualStr(expected, providedHex.toLowerCase());
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  let actual;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Used to keep login timing roughly constant for unknown accounts.
export const DUMMY_PASSWORD_HASH = hashPassword(randomToken(24));

export function deriveKey(masterKeyB64) {
  const raw = Buffer.from(masterKeyB64, 'base64');
  if (raw.length !== 32) {
    throw new Error('Master key must be 32 bytes (base64 encoded)');
  }
  return raw;
}

export function encrypt(plaintext, masterKeyB64) {
  const key = typeof masterKeyB64 === 'string' ? deriveKey(masterKeyB64) : masterKeyB64;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
}

export function decrypt(payload, masterKeyB64) {
  const key = typeof masterKeyB64 === 'string' ? deriveKey(masterKeyB64) : masterKeyB64;
  const parts = String(payload || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid ciphertext');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function loadOrCreateMasterKey(file, envValue) {
  if (envValue) {
    deriveKey(envValue);
    return envValue;
  }
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) {
      deriveKey(existing);
      return existing;
    }
  } catch {
    // create below
  }
  const key = crypto.randomBytes(32).toString('base64');
  fs.writeFileSync(file, key + '\n', { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best effort
  }
  return key;
}

export function loadOrCreateSecret(file, envValue) {
  if (envValue) return envValue;
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // create below
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret + '\n', { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best effort
  }
  return secret;
}
