import { app, BrowserWindow, dialog, protocol, session, shell } from 'electron';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_URL, SERVER_URL, isAppUrl, safeFile, isAuthNavigation, externalUrl, trustedRequest, sessionRequestPolicy, rendererAuthResponse } from './policy.mjs';
import { createCatalog } from './catalog-client.mjs';
import { guestProfile } from './local-api.mjs';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }]);
app.setName('Sindaris');
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let mainWindow;
let authWindow;
let catalog;
let offlineGuest = false;
let preferencesFile;
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const error = (message, status = 503) => json({ error: { message, code: 'desktop' } }, status);
const persistGuest = async (value) => {
  offlineGuest = value;
  await writeFile(preferencesFile, JSON.stringify({ offlineGuest: value }), 'utf8');
};

function openExternal(value) {
  const safe = externalUrl(value);
  if (safe) void shell.openExternal(safe).catch(() => {});
}

function openLogin(ses) {
  if (authWindow && !authWindow.isDestroyed()) { authWindow.focus(); return; }
  authWindow = new BrowserWindow({
    title: 'Sindaris — вход через Discord', width: 760, height: 840, autoHideMenuBar: true,
    parent: mainWindow,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const auth = authWindow;
  auth.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  const guard = (event, url) => { if (!isAuthNavigation(url)) event.preventDefault(); };
  auth.webContents.on('will-navigate', guard);
  auth.webContents.on('will-redirect', guard);
  const returned = (_event, value) => {
    const u = new URL(value);
    if (u.origin !== SERVER_URL || u.pathname !== '/') return;
    // Cookies stay in the persistent session; only the non-secret UI state returns.
    const query = new URLSearchParams();
    if (u.searchParams.get('setup') === 'guild') query.set('setup', 'guild');
    if (u.searchParams.has('error')) query.set('error', u.searchParams.get('error').slice(0, 100));
    void persistGuest(false).then(() => mainWindow?.loadURL(APP_URL + (query.size ? '?' + query : '')))
      .catch(() => dialog.showErrorBox('Sindaris', 'Не удалось сохранить состояние входа.'));
    auth.close();
  };
  auth.webContents.on('did-navigate', returned);
  auth.on('closed', () => { if (authWindow === auth) authWindow = null; });
  void auth.loadURL(SERVER_URL + '/api/v1/auth/discord/login?return_to=%2F').catch(() => {
    dialog.showErrorBox('Sindaris', 'Не удалось открыть Discord. Проверьте подключение к интернету.');
  });
}

async function fileResponse(ses, root, pathname) {
  const file = safeFile(root, pathname);
  // Bundled directories only, never user-provided filesystem paths.
  if (!(await stat(file)).isFile()) return new Response('Not found', { status: 404 });
  return ses.fetch(pathToFileURL(file).href);
}

async function createWindow(ses) {
  mainWindow = new BrowserWindow({
    title: 'Sindaris', width: 1440, height: 960, minWidth: 900, minHeight: 640,
    backgroundColor: '#0a0c0b', autoHideMenuBar: true, show: false,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  const win = mainWindow;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, value) => {
    if (isAppUrl(value)) {
      if (new URL(value).pathname === '/api/v1/auth/discord/login') {
        event.preventDefault(); openLogin(ses);
      } else if (new URL(value).pathname.startsWith('/api/')) event.preventDefault();
      return;
    }
    event.preventDefault(); openExternal(value);
  });
  await win.loadURL(APP_URL);
}

if (locked) app.whenReady().then(async () => {
  preferencesFile = path.join(app.getPath('userData'), 'desktop-preferences.json');
  try { offlineGuest = JSON.parse(await readFile(preferencesFile, 'utf8')).offlineGuest === true; } catch { /* first launch */ }
  const root = app.getAppPath();
  const resources = path.join(root, 'resources');
  catalog = createCatalog(path.join(resources, 'snapshot.json'));
  const ses = session.fromPartition('persist:sindaris-desktop');
  ses.setPermissionRequestHandler((_wc, permission, done) => done(permission === 'clipboard-sanitized-write'));
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write');
  ses.protocol.handle('app', async (request) => {
    if (!trustedRequest(request)) return error('Недопустимый источник запроса', 403);
    const u = new URL(request.url);
    try {
      if (u.pathname.startsWith('/api/v1/assets/')) {
        if (!['GET', 'HEAD'].includes(request.method)) return error('Метод не поддерживается', 405);
        return await fileResponse(ses, path.join(resources, 'static'), u.pathname.slice('/api/v1/assets'.length));
      }
      if (!u.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(request.method)) return error('Метод не поддерживается', 405);
        if (u.pathname === '/') return await fileResponse(ses, path.join(root, 'dist'), '/index.html');
        try { return await fileResponse(ses, path.join(root, 'dist'), u.pathname); }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
        return await fileResponse(ses, path.join(resources, 'public'), u.pathname);
      }
      if (request.method === 'POST' && u.pathname === '/api/v1/auth/guest') {
        await persistGuest(true);
        return json({ me: guestProfile, message: 'Локальный гостевой доступ' });
      }
      if (u.pathname === '/api/v1/auth/me' && offlineGuest && request.method === 'GET') return json(guestProfile);
      if (request.method === 'POST' && u.pathname === '/api/v1/auth/logout') {
        await persistGuest(false);
        for (const cookie of await ses.cookies.get({ url: SERVER_URL })) {
          await ses.cookies.remove(SERVER_URL + cookie.path, cookie.name);
        }
        return new Response(null, { status: 204 });
      }
      if (request.method === 'GET') {
        const local = await catalog.query(u.pathname + u.search);
        if (local !== undefined) return json(local);
      }
      // Local guest is deliberately incapable of sending privileged server requests.
      if (offlineGuest) return error('Для данных клана войдите через Discord и подключитесь к интернету.', 403);
      const headers = new Headers();
      const policy = sessionRequestPolicy(u.pathname, await ses.cookies.get({ url: SERVER_URL }));
      if (policy.localUnauthorized) return error('Войдите через Discord или выберите гостевой режим.', 401);
      for (const name of ['accept', 'content-type', 'x-locale', 'accept-language', 'range']) {
        const value = request.headers.get(name); if (value) headers.set(name, value);
      }
      const body = ['GET', 'HEAD'].includes(request.method) ? undefined : new Uint8Array(await request.arrayBuffer());
      if (body && body.byteLength > 65 * 1024 * 1024) return error('Слишком большой файл', 413);
      const upstream = await ses.fetch(SERVER_URL + u.pathname + u.search, {
        method: request.method, headers, body, credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(policy.timeout),
      });
      if (upstream.status >= 300 && upstream.status < 400) return error('Неожиданное перенаправление сервера', 502);
      const responseHeaders = new Headers();
      for (const name of ['content-type', 'content-language', 'content-disposition']) {
        const value = upstream.headers.get(name); if (value) responseHeaders.set(name, value);
      }
      responseHeaders.set('Cache-Control', 'no-store');
      if (upstream.headers.get('content-type')?.includes('application/json') &&
          ['/api/v1/auth/discord/setup', '/api/v1/auth/developer/enter', '/api/v1/auth/dev-token'].includes(u.pathname)) {
        return json(rendererAuthResponse(u.pathname, await upstream.json()), upstream.status);
      }
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch (e) {
      if ([400, 404].includes(e.status)) return error(e.message, e.status);
      if (e instanceof URIError || e.message === 'Invalid asset path') return error('Недопустимый путь', 400);
      if (e.code === 'ENOENT') return new Response('Not found', { status: 404 });
      return error('Сервис недоступен. Проверьте интернет. Локальные справочники доступны в гостевом режиме.');
    }
  });
  await createWindow(ses);
  app.on('activate', () => { if (!mainWindow) void createWindow(ses); });
}).catch(() => { dialog.showErrorBox('Sindaris', 'Не удалось запустить приложение. Выполните сборку desktop заново.'); app.quit(); });
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { void catalog?.close(); });
