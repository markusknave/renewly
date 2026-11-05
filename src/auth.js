import { config } from './config.js';
import { get, nowIso, run } from './db.js';
import {
  DUMMY_PASSWORD_HASH,
  decrypt,
  encrypt,
  hashPassword,
  randomToken,
  sha256Hex,
  verifyPassword,
} from './lib/crypto.js';
import { AppError, ValidationError } from './lib/errors.js';

export const SESSION_COOKIE = 'renewly_sid';

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateEmail(email) {
  if (!email || email.length > 254) return 'Enter a valid email address';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
  return null;
}

export function passwordProblem(password) {
  const value = String(password || '');
  if (value.length < 10) return 'Password must be at least 10 characters';
  if (value.length > 200) return 'Password must be 200 characters or fewer';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Password must include at least one letter and one number';
  }
  return null;
}

export function validTimezone(tz) {
  if (!tz || typeof tz !== 'string') return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'UTC';
  }
}

export function validCurrency(value, fallback = 'USD') {
  const c = String(value || fallback).toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : fallback;
}

export function getUserById(db, id) {
  return get(db, 'SELECT * FROM users WHERE id = ?', Number(id)) || null;
}

export function getUserByEmail(db, email) {
  return get(db, 'SELECT * FROM users WHERE email = ?', normalizeEmail(email)) || null;
}

export function createSession(db, { userId = null, ip = null, userAgent = null } = {}) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionTtlDays * 86400000);
  const res = run(
    db,
    `INSERT INTO sessions
      (token_hash, user_id, csrf_token, created_at, last_seen, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    sha256Hex(token),
    userId,
    csrf,
    now.toISOString(),
    now.toISOString(),
    expires.toISOString(),
    ip ? String(ip).slice(0, 100) : null,
    userAgent ? String(userAgent).slice(0, 300) : null
  );
  return {
    id: Number(res.lastInsertRowid),
    token,
    csrf_token: csrf,
    user_id: userId,
    expires_at: expires.toISOString(),
  };
}

export function getSessionByToken(db, token) {
  if (!token) return null;
  const row = get(db, 'SELECT * FROM sessions WHERE token_hash = ?', sha256Hex(token));
  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) {
    run(db, 'DELETE FROM sessions WHERE id = ?', row.id);
    return null;
  }
  if (Date.parse(row.last_seen) + config.sessionIdleDays * 86400000 <= now) {
    run(db, 'DELETE FROM sessions WHERE id = ?', row.id);
    return null;
  }
  if (now - Date.parse(row.last_seen) > 5 * 60 * 1000) {
    run(db, 'UPDATE sessions SET last_seen = ? WHERE id = ?', new Date(now).toISOString(), row.id);
  }
  return row;
}

export function destroySession(db, sessionId) {
  if (sessionId) run(db, 'DELETE FROM sessions WHERE id = ?', Number(sessionId));
}

export function deleteOtherSessions(db, userId, keepSessionId) {
  run(
    db,
    'DELETE FROM sessions WHERE user_id = ? AND id != ?',
    Number(userId),
    Number(keepSessionId)
  );
}

export function audit(db, { userId = null, action, ip = null, meta = null }) {
  run(
    db,
    'INSERT INTO audit_log (user_id, action, ip, meta_json, created_at) VALUES (?, ?, ?, ?, ?)',
    userId,
    String(action).slice(0, 80),
    ip ? String(ip).slice(0, 100) : null,
    meta ? JSON.stringify(meta).slice(0, 2000) : null,
    nowIso()
  );
}

function issueTokens() {
  const ingestToken = randomToken(24);
  const calendarToken = randomToken(24);
  return {
    ingestToken,
    calendarToken,
    ingestHash: sha256Hex(ingestToken),
    calendarHash: sha256Hex(calendarToken),
    ingestEnc: encrypt(ingestToken, config.masterKey),
    calendarEnc: encrypt(calendarToken, config.masterKey),
  };
}

export function registerUser(db, { email, password, timezone, currency, ip }) {
  const normalized = normalizeEmail(email);
  const emailError = validateEmail(normalized);
  if (emailError) throw new ValidationError(emailError);
  const pwError = passwordProblem(password);
  if (pwError) throw new ValidationError(pwError);
  if (getUserByEmail(db, normalized)) {
    throw new ValidationError('An account with that email already exists');
  }
  const tokens = issueTokens();
  const res = run(
    db,
    `INSERT INTO users
      (email, password_hash, timezone, currency, reminder_days,
       email_ingest_token_hash, email_ingest_token_enc, calendar_token_hash, calendar_token_enc,
       created_at)
     VALUES (?, ?, ?, ?, '7,3,1', ?, ?, ?, ?, ?)`,
    normalized,
    hashPassword(password),
    validTimezone(timezone),
    validCurrency(currency),
    tokens.ingestHash,
    tokens.ingestEnc,
    tokens.calendarHash,
    tokens.calendarEnc,
    nowIso()
  );
  const user = getUserById(db, Number(res.lastInsertRowid));
  audit(db, { userId: user.id, action: 'register', ip });
  return { user, ...tokens };
}

export function loginUser(db, { email, password, ip }) {
  const user = getUserByEmail(db, email);
  const stored = user ? user.password_hash : DUMMY_PASSWORD_HASH;
  const ok = verifyPassword(String(password || ''), stored);
  if (!user || !ok) {
    audit(db, { userId: user?.id ?? null, action: 'login_failed', ip, meta: { email: normalizeEmail(email) } });
    throw new AppError(401, 'Invalid email or password', 'invalid_credentials');
  }
  audit(db, { userId: user.id, action: 'login', ip });
  return user;
}

export function revealIngestToken(user) {
  if (!user?.email_ingest_token_enc) return null;
  try {
    return decrypt(user.email_ingest_token_enc, config.masterKey);
  } catch {
    return null;
  }
}

export function revealCalendarToken(user) {
  if (!user?.calendar_token_enc) return null;
  try {
    return decrypt(user.calendar_token_enc, config.masterKey);
  } catch {
    return null;
  }
}

export function rotateIngestToken(db, userId) {
  const token = randomToken(24);
  run(
    db,
    'UPDATE users SET email_ingest_token_hash = ?, email_ingest_token_enc = ? WHERE id = ?',
    sha256Hex(token),
    encrypt(token, config.masterKey),
    Number(userId)
  );
  return token;
}

export function rotateCalendarToken(db, userId) {
  const token = randomToken(24);
  run(
    db,
    'UPDATE users SET calendar_token_hash = ?, calendar_token_enc = ? WHERE id = ?',
    sha256Hex(token),
    encrypt(token, config.masterKey),
    Number(userId)
  );
  return token;
}

export function findUserByIngestToken(db, token) {
  if (!token) return null;
  return (
    get(db, 'SELECT * FROM users WHERE email_ingest_token_hash = ?', sha256Hex(token)) || null
  );
}

export function findUserByCalendarToken(db, token) {
  if (!token) return null;
  return (
    get(db, 'SELECT * FROM users WHERE calendar_token_hash = ?', sha256Hex(token)) || null
  );
}

export function changePassword(db, userId, currentPassword, nextPassword, ip) {
  const user = getUserById(db, userId);
  if (!user) throw new AppError(401, 'Not authenticated');
  if (!verifyPassword(String(currentPassword || ''), user.password_hash)) {
    throw new ValidationError('Current password is incorrect');
  }
  const problem = passwordProblem(nextPassword);
  if (problem) throw new ValidationError(problem);
  run(
    db,
    'UPDATE users SET password_hash = ? WHERE id = ?',
    hashPassword(nextPassword),
    Number(userId)
  );
  run(db, 'DELETE FROM sessions WHERE user_id = ?', Number(userId));
  audit(db, { userId, action: 'password_changed', ip });
}

export function deleteAccount(db, userId, password, ip) {
  const user = getUserById(db, userId);
  if (!user) throw new AppError(401, 'Not authenticated');
  if (!verifyPassword(String(password || ''), user.password_hash)) {
    throw new ValidationError('Password is incorrect');
  }
  run(db, 'DELETE FROM users WHERE id = ?', Number(userId));
  run(db, 'DELETE FROM audit_log WHERE user_id = ?', Number(userId));
  audit(db, { userId: null, action: 'account_deleted', ip });
}

export function ingestAddressFor(token) {
  return `renewly+${token}@${config.ingestDomain}`;
}

export function calendarUrlFor(token) {
  return `${config.baseUrl}/calendar/${token}.ics`;
}
