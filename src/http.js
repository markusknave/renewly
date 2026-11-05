import fs from 'node:fs';
import path from 'node:path';
import { AppError } from './lib/errors.js';

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    let value = part.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite || 'Strict'}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = String(forwarded).split(',')[0].trim();
      if (first) return first;
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        reject(new AppError(413, 'Request body too large', 'payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

export function parseBody(raw, contentType) {
  const text = raw.toString('utf8');
  if (!text) return {};
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError(400, 'Invalid JSON body', 'invalid_json');
    }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  return text;
}

export function securityHeaders(res, { secure = false } = {}) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  res.setHeader('Cache-Control', 'no-store');
  if (secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

export function sendHtml(res, status, html, headers = {}) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    ...headers,
  });
  res.end(html);
}

export function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

export function redirect(res, location, status = 303) {
  res.writeHead(status, { location });
  res.end();
}

function patternToRegex(pattern) {
  if (pattern === '/') return { regex: /^\/$/, keys: [] };
  const keys = [];
  let re = '^';
  const parts = pattern.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (i > 0) re += '/';
    if (part.startsWith(':') && part.length > 1) {
      const key = part.slice(1).replace(/[^A-Za-z0-9_]/g, '');
      keys.push(key);
      const suffix = part.slice(1).slice(key.length);
      re += '([^/]+?)';
      if (suffix) re += suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (part === '*') {
      keys.push('wildcard');
      re += '(.*)';
    } else {
      re += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  re += '/?$';
  return { regex: new RegExp(re), keys };
}

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const { regex, keys } = patternToRegex(pattern);
    this.routes.push({ method: method.toUpperCase(), pattern, regex, keys, handler });
    return this;
  }

  get(pattern, handler) {
    return this.add('GET', pattern, handler);
  }

  post(pattern, handler) {
    return this.add('POST', pattern, handler);
  }

  patch(pattern, handler) {
    return this.add('PATCH', pattern, handler);
  }

  put(pattern, handler) {
    return this.add('PUT', pattern, handler);
  }

  delete(pattern, handler) {
    return this.add('DELETE', pattern, handler);
  }

  match(method, pathname) {
    const wanted = method === 'HEAD' ? 'GET' : method;
    for (const route of this.routes) {
      if (route.method !== wanted) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      route.keys.forEach((key, idx) => {
        try {
          params[key] = decodeURIComponent(m[idx + 1] ?? '');
        } catch {
          params[key] = m[idx + 1] ?? '';
        }
      });
      return { route, params };
    }
    return null;
  }
}

export class RateLimiter {
  constructor() {
    this.buckets = new Map();
    this.lastSweep = Date.now();
  }

  check(key, limit, windowMs) {
    const now = Date.now();
    if (now - this.lastSweep > 60_000) {
      for (const [k, v] of this.buckets) {
        if (v.reset <= now) this.buckets.delete(k);
      }
      this.lastSweep = now;
    }
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.reset <= now) {
      bucket = { count: 0, reset: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }
}

const STATIC_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

export function serveStatic(res, baseDir, relPath) {
  const safeRel = path.normalize(relPath).replace(/^([/\\])+/, '');
  const full = path.join(baseDir, safeRel);
  if (!full.startsWith(baseDir + path.sep)) return false;
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(full).toLowerCase();
  const cacheControl =
    safeRel === 'sw.js'
      ? 'no-cache'
      : safeRel.startsWith('icons/')
        ? 'public, max-age=604800'
        : 'public, max-age=3600';
  res.writeHead(200, {
    'content-type': STATIC_TYPES[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': cacheControl,
  });
  fs.createReadStream(full).pipe(res);
  return true;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}
