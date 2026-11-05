import { sendJson } from '../http.js';
import { AuthError } from '../lib/errors.js';

export function requireUser(ctx) {
  if (!ctx.user) throw new AuthError('Please sign in');
  return ctx.user;
}

export function safeRedirect(value, fallback = '/dashboard') {
  if (typeof value !== 'string' || !value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}

export function formRedirect(ctx, target, { msg = '', err = '' } = {}) {
  const url = new URL(safeRedirect(target), ctx.config.baseUrl);
  if (msg) url.searchParams.set('msg', msg);
  if (err) url.searchParams.set('err', err);
  ctx.res.writeHead(303, { location: `${url.pathname}${url.search}` });
  ctx.res.end();
}

export function respond(ctx, { status = 200, message = '', data = {}, redirectTo = '/dashboard' } = {}) {
  if (ctx.isForm) {
    formRedirect(ctx, ctx.body?._redirect || redirectTo, { msg: message });
    return;
  }
  sendJson(ctx.res, status, { ok: status < 400, message, ...data });
}
