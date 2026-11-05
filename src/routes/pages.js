import {
  SESSION_COOKIE,
  calendarUrlFor,
  createSession,
  destroySession,
  ingestAddressFor,
  loginUser,
  normalizeEmail,
  registerUser,
  revealCalendarToken,
  revealIngestToken,
} from '../auth.js';
import { dashboardData } from '../domain/subscriptions.js';
import { serializeCookie } from '../http.js';
import { AppError } from '../lib/errors.js';
import { authPage, dashboardPage, settingsPage } from '../views.js';
import { formRedirect, requireUser } from './helpers.js';

function sessionCookie(ctx, token) {
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge: ctx.config.sessionTtlDays * 86400,
    secure: ctx.config.secureCookies,
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
  });
}

function renderAuth(ctx, mode) {
  return authPage({
    mode,
    csrfToken: ctx.csrfToken,
    notice: ctx.query.get('msg') || '',
    error: ctx.query.get('err') || '',
  });
}

export function registerPageRoutes(router) {
  router.get('/', (ctx) => {
    ctx.res.writeHead(302, { location: ctx.user ? '/dashboard' : '/login' });
    ctx.res.end();
  });

  router.get('/login', (ctx) => {
    if (ctx.user) {
      ctx.res.writeHead(302, { location: '/dashboard' });
      ctx.res.end();
      return;
    }
    ctx.res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    ctx.res.end(renderAuth(ctx, 'login'));
  });

  router.get('/register', (ctx) => {
    if (ctx.user) {
      ctx.res.writeHead(302, { location: '/dashboard' });
      ctx.res.end();
      return;
    }
    ctx.res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    ctx.res.end(renderAuth(ctx, 'register'));
  });

  router.post('/login', (ctx) => {
    const body = ctx.body || {};
    const email = normalizeEmail(body.email);
    if (!ctx.limiter.check(`login:${ctx.ip}:${email}`, 10, 15 * 60 * 1000)) {
      throw new AppError(429, 'Too many sign-in attempts. Wait 15 minutes and try again.');
    }
    const user = loginUser(ctx.db, { email, password: body.password, ip: ctx.ip });
    const session = createSession(ctx.db, { userId: user.id, ip: ctx.ip, userAgent: ctx.ua });
    destroySession(ctx.db, ctx.session?.id);
    ctx.setSessionCookie(sessionCookie(ctx, session.token));
    formRedirect(ctx, '/dashboard');
  });

  router.post('/register', (ctx) => {
    const body = ctx.body || {};
    if (!ctx.limiter.check(`register:${ctx.ip}`, 10, 60 * 60 * 1000)) {
      throw new AppError(429, 'Too many accounts created from this address. Try later.');
    }
    const result = registerUser(ctx.db, {
      email: body.email,
      password: body.password,
      timezone: body.timezone,
      currency: body.currency,
      ip: ctx.ip,
    });
    const session = createSession(ctx.db, {
      userId: result.user.id,
      ip: ctx.ip,
      userAgent: ctx.ua,
    });
    destroySession(ctx.db, ctx.session?.id);
    ctx.setSessionCookie(sessionCookie(ctx, session.token));
    formRedirect(ctx, '/dashboard');
  });

  router.post('/logout', (ctx) => {
    destroySession(ctx.db, ctx.session?.id);
    ctx.clearSessionCookie();
    formRedirect(ctx, '/login', { msg: 'You have been signed out.' });
  });

  router.get('/dashboard', (ctx) => {
    const user = requireUser(ctx);
    const data = dashboardData(ctx.db, user);
    const ingestToken = revealIngestToken(user);
    const calendarToken = revealCalendarToken(user);
    const html = dashboardPage({
      user,
      data,
      csrfToken: ctx.csrfToken,
      notice: ctx.query.get('msg') || '',
      error: ctx.query.get('err') || '',
      ingestAddress: ingestToken ? ingestAddressFor(ingestToken) : '',
      calendarUrl: calendarToken ? calendarUrlFor(calendarToken) : '',
    });
    ctx.res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    ctx.res.end(html);
  });

  router.get('/settings', (ctx) => {
    const user = requireUser(ctx);
    const ingestToken = revealIngestToken(user);
    const calendarToken = revealCalendarToken(user);
    const html = settingsPage({
      user,
      csrfToken: ctx.csrfToken,
      notice: ctx.query.get('msg') || '',
      error: ctx.query.get('err') || '',
      ingestAddress: ingestToken ? ingestAddressFor(ingestToken) : '',
      calendarUrl: calendarToken ? calendarUrlFor(calendarToken) : '',
    });
    ctx.res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    ctx.res.end(html);
  });
}
