import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  getSessionByToken,
  getUserById,
} from './auth.js';
import { config } from './config.js';
import { openDb } from './db.js';
import {
  RateLimiter,
  Router,
  clientIp,
  parseBody,
  parseCookies,
  readBody,
  redirect,
  securityHeaders,
  sendHtml,
  sendJson,
  serializeCookie,
  serveStatic,
} from './http.js';
import { startScheduler } from './jobs/scheduler.js';
import { timingSafeEqualStr } from './lib/crypto.js';
import { AppError } from './lib/errors.js';
import { createNotifier } from './notifications/notifier.js';
import { registerApiRoutes } from './routes/api.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import { safeRedirect } from './routes/helpers.js';
import { registerPageRoutes } from './routes/pages.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { messagePage } from './views.js';

function sessionCookie(token) {
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge: config.sessionTtlDays * 86400,
    secure: config.secureCookies,
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
  });
}

function clearedSessionCookie() {
  return serializeCookie(SESSION_COOKIE, '', {
    maxAge: 0,
    secure: config.secureCookies,
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
  });
}

function handleError(err, ctx, req, res) {
  const status = Number(err?.status) || 500;
  if (status >= 500) console.error('[error]', err);
  if (res.headersSent) {
    try {
      res.end();
    } catch {
      // ignore
    }
    return;
  }
  const wantsJson = ctx
    ? ctx.path.startsWith('/api') ||
      ctx.path.startsWith('/webhooks') ||
      String(req.headers.accept || '').includes('application/json')
    : false;
  const message = status >= 500 ? 'Internal server error' : err?.message || 'Request failed';

  if (wantsJson) {
    sendJson(res, status, { ok: false, error: message, code: err?.code || 'error' });
    return;
  }

  if (ctx?.isForm) {
    let target = '/dashboard';
    if (ctx.path === '/login') target = '/login';
    else if (ctx.path === '/register') target = '/register';
    else target = safeRedirect(ctx.body?._redirect, ctx.user ? '/dashboard' : '/login');
    const url = new URL(target, config.baseUrl);
    url.searchParams.set('err', message);
    redirect(res, `${url.pathname}${url.search}`);
    return;
  }

  if (status === 401) {
    redirect(res, ctx?.user ? '/dashboard' : '/login');
    return;
  }

  const html = messagePage({
    title: status === 404 ? 'Not found' : 'Something went wrong',
    message,
    user: ctx?.user || null,
    csrfToken: ctx?.csrfToken || '',
  });
  sendHtml(res, status, html);
}

async function handleRequest(req, res, { db, notifier, limiter, router, publicDir }) {
  securityHeaders(res, { secure: config.secureCookies });
  let ctx = null;

  try {
    const method = (req.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      res.writeHead(405, { allow: 'GET, HEAD, POST, PUT, PATCH, DELETE' });
      res.end();
      return;
    }
    const url = new URL(req.url || '/', config.baseUrl);
    const pathname = url.pathname;

    if (method === 'GET' || method === 'HEAD') {
      if (
        /^\/(?:styles\.css|app\.js|sw\.js|manifest\.webmanifest|favicon\.svg)$/.test(pathname) ||
        /^\/icons\/[a-z0-9.-]+\.png$/i.test(pathname)
      ) {
        if (serveStatic(res, publicDir, pathname)) return;
      }
      if (pathname === '/favicon.ico') {
        res.writeHead(302, { location: '/favicon.svg' });
        res.end();
        return;
      }
    }

    const matched = router.match(method, pathname);
    if (!matched) {
      if (pathname.startsWith('/api') || pathname.startsWith('/webhooks')) {
        sendJson(res, 404, { ok: false, error: 'Not found' });
        return;
      }
      redirect(res, '/');
      return;
    }

    const ip = clientIp(req, config.trustProxy);
    const ua = String(req.headers['user-agent'] || '');
    const hasBody = !['GET', 'HEAD'].includes(method);
    const rawBody = hasBody ? await readBody(req, config.maxBodyBytes) : Buffer.alloc(0);
    const body = hasBody ? parseBody(rawBody, req.headers['content-type']) : {};

    const isMachine =
      pathname.startsWith('/webhooks/') || pathname.startsWith('/calendar/');
    const cookies = parseCookies(req.headers.cookie);
    let sessionRow = getSessionByToken(db, cookies[SESSION_COOKIE]);
    let initialCookie = null;

    if (!sessionRow && !isMachine) {
      sessionRow = createSession(db, { userId: null, ip, userAgent: ua });
      initialCookie = sessionCookie(sessionRow.token);
    } else if (sessionRow?.user_id && !getUserById(db, sessionRow.user_id)) {
      destroySession(db, sessionRow.id);
      sessionRow = null;
      if (!isMachine) {
        sessionRow = createSession(db, { userId: null, ip, userAgent: ua });
        initialCookie = sessionCookie(sessionRow.token);
      }
    }

    const user = sessionRow?.user_id ? getUserById(db, sessionRow.user_id) : null;
    const csrfToken = sessionRow?.csrf_token || '';
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (mutating && !isMachine) {
      const provided = String(
        req.headers['x-csrf-token'] ||
          (body && typeof body === 'object' ? body._csrf : '') ||
          ''
      );
      if (!sessionRow || !timingSafeEqualStr(provided, sessionRow.csrf_token)) {
        throw new AppError(403, 'Invalid or missing CSRF token', 'csrf');
      }
      const origin = req.headers.origin;
      if (origin && origin !== new URL(config.baseUrl).origin) {
        throw new AppError(403, 'Cross-origin request blocked', 'bad_origin');
      }
    }

    const isForm = String(req.headers['content-type'] || '').includes(
      'application/x-www-form-urlencoded'
    );

    ctx = {
      db,
      config,
      notifier,
      limiter,
      req,
      res,
      method,
      url,
      path: pathname,
      query: url.searchParams,
      params: matched.params,
      body,
      rawBody,
      user,
      session: sessionRow,
      csrfToken,
      ip,
      ua,
      isForm,
      setSessionCookie(value) {
        res.setHeader('Set-Cookie', value);
      },
      clearSessionCookie() {
        res.setHeader('Set-Cookie', clearedSessionCookie());
      },
    };

    if (initialCookie && !res.hasHeader('Set-Cookie')) {
      res.setHeader('Set-Cookie', initialCookie);
    }

    await matched.route.handler(ctx);
    if (!res.writableEnded) {
      sendJson(res, 404, { ok: false, error: 'Not found' });
    }
  } catch (err) {
    handleError(err, ctx, req, res);
  }
}

export function createApp({ dbFile = config.dbFile, notifier = createNotifier(), startJobs = false } = {}) {
  const db = openDb(dbFile);
  const limiter = new RateLimiter();
  const router = new Router();
  registerPageRoutes(router);
  registerApiRoutes(router);
  registerWebhookRoutes(router);
  registerCalendarRoutes(router);

  const publicDir = path.join(config.root, 'public');
  const server = http.createServer((req, res) => {
    handleRequest(req, res, { db, notifier, limiter, router, publicDir }).catch((err) => {
      handleError(err, null, req, res);
    });
  });

  let scheduler = null;
  if (startJobs) scheduler = startScheduler({ db, notifier });

  return { server, db, router, limiter, notifier, scheduler, publicDir };
}

export async function start() {
  const app = createApp({ startJobs: true });
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(config.port, () => resolve());
  });
  console.log(`Renewly listening on http://localhost:${config.port}`);
  console.log(`Public base URL: ${config.baseUrl}`);
  console.log(`Database: ${config.dbFile}`);
  console.log(`Ingest domain: ${config.ingestDomain}`);

  const shutdown = () => {
    app.scheduler?.stop();
    app.server.close(() => {
      try {
        app.db.close();
      } catch {
        // ignore
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return app;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  start().catch((err) => {
    console.error('Failed to start Renewly:', err);
    process.exit(1);
  });
}
