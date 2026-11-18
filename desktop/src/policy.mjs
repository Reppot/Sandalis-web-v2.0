import path from 'node:path';
export const APP_URL = 'app://sindaris/';
export const SERVER_URL = 'https://sandalis-web-v2-0.onrender.com';
export function sessionRequestPolicy(pathname, cookies) {
  const me = pathname === '/api/v1/auth/me';
  return { localUnauthorized: me && !cookies.some(c => c.name === 'sandalis_session'), timeout: me ? 8000 : 120000 };
}
export function rendererAuthResponse(pathname, payload) {
  if (!['/api/v1/auth/discord/setup', '/api/v1/auth/developer/enter', '/api/v1/auth/dev-token'].includes(pathname)) return payload;
  const { access_token, refresh_token, token_type, ...safe } = payload;
  return safe;
}
export function isAppUrl(value) {
  try { const u = new URL(value); return u.protocol === 'app:' && u.host === 'sindaris' && !u.username && !u.password; } catch { return false; }
}
export function safeFile(root, pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.includes(':') || decoded.split('/').includes('..')) throw new Error('Invalid asset path');
  const base = path.resolve(root);
  const file = path.resolve(base, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded));
  const rel = path.relative(base, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Invalid asset path');
  return file;
}
export function isAuthNavigation(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && (u.origin === SERVER_URL || u.hostname === 'discord.com' || u.hostname.endsWith('.discord.com')); } catch { return false; }
}
export function externalUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function trustedRequest(request) {
  if (!isAppUrl(request.url)) return false;
  const origin = request.headers.get('origin');
  return !origin || origin === 'app://sindaris';
}
