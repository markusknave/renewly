import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  currency TEXT NOT NULL DEFAULT 'USD',
  reminder_days TEXT NOT NULL DEFAULT '7,3,1',
  email_ingest_token_hash TEXT,
  email_ingest_token_enc TEXT,
  calendar_token_hash TEXT,
  calendar_token_enc TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  plan_name TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  cadence TEXT NOT NULL DEFAULT 'monthly',
  custom_interval_days INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  next_renewal_date TEXT,
  started_on TEXT,
  last_charge_date TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  confidence REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id, status);

CREATE TABLE IF NOT EXISTS subscription_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount_cents INTEGER,
  currency TEXT,
  effective_date TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user ON subscription_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_txn_id TEXT NOT NULL,
  merchant_raw TEXT NOT NULL,
  merchant_key TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  posted_date TEXT NOT NULL,
  account_label TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, provider, provider_txn_id)
);
CREATE INDEX IF NOT EXISTS idx_tx_stream
  ON transactions(user_id, merchant_key, posted_date);

CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  merchant_key TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  plan_name TEXT,
  amount_cents INTEGER,
  currency TEXT,
  cadence TEXT,
  next_renewal_date TEXT,
  evidence_json TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_detections_user ON detections(user_id, status);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  fire_at TEXT NOT NULL,
  days_before INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TEXT,
  UNIQUE(subscription_id, fire_at, days_before)
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, fire_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  ip TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  UNIQUE(source, event_id)
);

CREATE TABLE IF NOT EXISTS bank_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'plaid',
  item_id TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  cursor TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(provider, item_id)
);
CREATE INDEX IF NOT EXISTS idx_bank_items_user ON bank_items(user_id);
`;

export function openDb(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA busy_timeout=5000');
  db.exec(SCHEMA);
  db.exec('PRAGMA user_version=1');
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best effort (not applicable to :memory:)
  }
  return db;
}

export function nowIso() {
  return new Date().toISOString();
}

export function all(db, sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function get(db, sql, ...params) {
  return db.prepare(sql).get(...params);
}

export function run(db, sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw err;
  }
}
