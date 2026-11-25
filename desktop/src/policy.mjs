import path from 'node:path';
export const APP_URL = 'app://sindaris/';
export const SERVER_URL = 'https://sandalis-web-v2-0.onrender.com';
export function sessionRequestPolicy(pathname) {
  const me = pathname === '/api/v1/auth/me';
  return { timeout: me ? 8000 : 120000 };
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

// Bearer credentials stay in the main process and can only reach the fixed API.
export function createNativeAuthSession(now = Date.now) {
  let token = '';
  let expiresAt = 0;
  const clear = () => { token = ''; expiresAt = 0; };
  return {
    clear,
    capture(pathname, method, status, payload) {
      if (method !== 'POST' || status < 200 || status >= 300 ||
          !['/api/v1/auth/discord/setup', '/api/v1/auth/developer/enter', '/api/v1/auth/dev-token'].includes(pathname)) return;
      clear();
      if (typeof payload?.access_token === 'string' && /^[A-Za-z0-9._~-]+$/.test(payload.access_token) &&
          payload.token_type === 'bearer' && Number.isFinite(payload.expires_in) && payload.expires_in > 0) {
        token = payload.access_token;
        expiresAt = now() + payload.expires_in * 1000;
      }
    },
    authorization(url) {
      const target = new URL(url);
      if (target.origin !== SERVER_URL || target.username || target.password) return null;
      if (now() >= expiresAt) clear();
      return token ? 'Bearer ' + token : null;
    },
  };
}
