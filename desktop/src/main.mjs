import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, session, shell, Tray } from 'electron';
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { APP_URL, SERVER_URL, isAppUrl, safeFile, isAuthNavigation, externalUrl, trustedRequest, sessionRequestPolicy, rendererAuthResponse, createNativeAuthSession } from './policy.mjs';
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
let tray;
let quitting = false;
let saveFolder = null;
let saveWatcher = null;
let scanTimer = null;
let lastSaveSignature = null;
let scanInProgress = false;
let scanChild = null;
let companionStatus = { state: 'waiting', folder: null, fileName: null, stockpiles: [], incompleteCount: 0, message: 'Выберите папку сохранений Foxhole.' };
let offlineGuest = false;
const nativeAuth = createNativeAuthSession();
let preferencesFile;
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const error = (message, status = 503) => json({ error: { message, code: 'desktop' } }, status);
const persistGuest = async (value) => {
  offlineGuest = value;
  const existing = await readPreferences();
  await writeFile(preferencesFile, JSON.stringify({ ...existing, offlineGuest: value, saveFolder }), 'utf8');
};
async function readPreferences() {
  try { return JSON.parse(await readFile(preferencesFile, 'utf8')); } catch { return {}; }
}
function publishCompanionStatus(patch) {
  companionStatus = { ...companionStatus, ...patch };
  mainWindow?.webContents.send('companion:status', companionStatus);
}
function trustedIpc(event) {
  return isAppUrl(event.senderFrame.url);
}

async function findSaveFile(folder) {
  const names = await readdir(folder);
  const candidates = await Promise.all(names.filter((name) => /_MapData\.sav$/i.test(name)).map(async (name) => {
    const file = path.join(folder, name);
    try { return { file, info: await stat(file) }; } catch { return null; }
  }));
  return candidates.filter((x) => x?.info.isFile()).sort((a, b) => b.info.mtimeMs - a.info.mtimeMs)[0] ?? null;
}

async function processSaveFile(file, signature) {
  if (scanInProgress || !file || quitting) return;
  scanInProgress = true;
  publishCompanionStatus({ state: 'processing', folder: saveFolder, fileName: path.basename(file), message: 'Читаю MapData.sav локально…' });
  const helper = app.isPackaged
    ? path.join(process.resourcesPath, 'fs.exe')
    : path.join(app.getAppPath(), 'resources', 'fs.exe');
  const output = path.join(app.getPath('temp'), `sindaris-fs-sav-${randomUUID()}.json`);
  let logs = '';
  try {
    await stat(helper);
    await new Promise((resolve, reject) => {
      const child = spawn(helper, ['sav', '--file', file, '--once', '--output', output], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FS_OUTPUT__HANDLERS: '[]' },
      });
      scanChild = child;
      child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
      child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
      child.once('error', reject);
      child.once('close', (code) => {
        if (scanChild === child) scanChild = null;
        code === 0 ? resolve() : reject(new Error(`fs-sav завершился с кодом ${code}`));
      });
    });
    let stockpiles = [];
    try {
      const payload = JSON.parse(await readFile(output, 'utf8'));
      stockpiles = Array.isArray(payload) ? payload : (payload.stockpiles ?? []);
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    const incompleteCount = [...logs.matchAll(/skipped: the game had no details for it/gi)].length;
    lastSaveSignature = signature;
    publishCompanionStatus({
      state: incompleteCount ? 'partial' : 'ready', folder: saveFolder, fileName: path.basename(file),
      stockpiles, incompleteCount,
      message: incompleteCount
        ? `Распознано складов: ${stockpiles.length}. Ещё ${incompleteCount} закреплённых объектов без доступных деталей — они не считаются пустыми.`
        : `Обработка завершена. Найдено складов: ${stockpiles.length}.`,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    publishCompanionStatus({ state: 'error', folder: saveFolder, fileName: path.basename(file), message: error.code === 'ENOENT' ? 'Локальный обработчик fs.exe не найден. Пересоберите приложение.' : `Не удалось прочитать сохранение: ${error.message}` });
  } finally {
    await rm(output, { force: true }).catch(() => {});
    scanInProgress = false;
  }
}

async function pollSaveFolder() {
  if (!saveFolder || quitting || scanInProgress) return;
  try {
    const candidate = await findSaveFile(saveFolder);
    if (!candidate) {
      publishCompanionStatus({ state: 'waiting', folder: saveFolder, fileName: null, stockpiles: [], incompleteCount: 0, message: 'В выбранной папке нет файлов *_MapData.sav.' });
      return;
    }
    const signature = `${candidate.file}:${candidate.info.size}:${candidate.info.mtimeMs}`;
    if (signature !== lastSaveSignature) await processSaveFile(candidate.file, signature);
  } catch (error) {
    publishCompanionStatus({ state: 'error', folder: saveFolder, message: `Не удалось проверить папку: ${error.message}` });
  }
}

async function setSaveFolder(folder) {
  saveFolder = folder;
  lastSaveSignature = null;
  saveWatcher?.close();
  if (scanTimer) clearInterval(scanTimer);
  const prefs = await readPreferences();
  await writeFile(preferencesFile, JSON.stringify({ ...prefs, offlineGuest, saveFolder }), 'utf8');
  companionStatus = { state: 'waiting', folder, fileName: null, stockpiles: [], incompleteCount: 0, message: 'Папка выбрана. Ожидаю локальное сканирование.' };
  if (folder) {
    try { saveWatcher = watch(folder, () => { void pollSaveFolder(); }); } catch { saveWatcher = null; }
    scanTimer = setInterval(() => void pollSaveFolder(), 2500);
    await pollSaveFolder();
  }
  return companionStatus;
}

function openExternal(value) {
  const safe = externalUrl(value);
  if (safe) void shell.openExternal(safe).catch(() => {});
}

function openLogin(ses) {
  nativeAuth.clear();
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
    void persistGuest(false).then(() => mainWindow?.webContents.send('auth:complete', Object.fromEntries(query)))
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
    webPreferences: { session: ses, preload: path.join(app.getAppPath(), 'src', 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  const win = mainWindow;
  win.once('ready-to-show', () => win.show());
  win.on('close', (event) => {
    if (!quitting) { event.preventDefault(); win.hide(); }
  });
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
  const preferences = await readPreferences();
  offlineGuest = preferences.offlineGuest === true;
  saveFolder = typeof preferences.saveFolder === 'string' ? preferences.saveFolder : null;
  const root = app.getAppPath();
  const resources = path.join(root, 'resources');
  catalog = createCatalog(path.join(resources, 'snapshot.json'));
  const ses = session.fromPartition('persist:sindaris-desktop');
  ipcMain.handle('companion:choose-save-folder', async (event) => {
    if (!trustedIpc(event)) return companionStatus;
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Папка сохранений Foxhole', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return companionStatus;
    return setSaveFolder(result.filePaths[0]);
  });
  ipcMain.handle('companion:get-status', (event) => trustedIpc(event) ? companionStatus : null);
  ipcMain.handle('companion:discord-login', (event) => {
    if (!trustedIpc(event)) return false;
    openLogin(ses);
    return true;
  });
  // Closing the window keeps the local companion process alive. Quit is explicit in the tray.
  const traySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="#101513"/><path d="M22 10H13a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H9" fill="none" stroke="#55d6a2" stroke-width="3" stroke-linecap="round"/></svg>';
  const trayImage = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(traySvg)}`);
  tray = new Tray(trayImage);
  tray.setToolTip('Sindaris — компаньон работает');
  const trayMenu = Menu.buildFromTemplate([
    { label: 'Открыть Sindaris', click: () => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(trayMenu);
  tray.on('double-click', () => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.show(); mainWindow?.focus(); });
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
        nativeAuth.clear();
        await persistGuest(true);
        return json({ me: guestProfile, message: 'Локальный гостевой доступ' });
      }
      if (u.pathname === '/api/v1/auth/me' && offlineGuest && request.method === 'GET') return json(guestProfile);
      if (request.method === 'POST' && u.pathname === '/api/v1/auth/logout') {
        nativeAuth.clear();
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
      const policy = sessionRequestPolicy(u.pathname);
      for (const name of ['accept', 'content-type', 'x-locale', 'accept-language', 'range']) {
        const value = request.headers.get(name); if (value) headers.set(name, value);
      }
      const body = ['GET', 'HEAD'].includes(request.method) ? undefined : new Uint8Array(await request.arrayBuffer());
      if (body && body.byteLength > 65 * 1024 * 1024) return error('Слишком большой файл', 413);
      const authorization = nativeAuth.authorization(SERVER_URL + u.pathname + u.search);
      if (authorization) headers.set('Authorization', authorization);
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
        const payload = await upstream.json();
        nativeAuth.capture(u.pathname, request.method, upstream.status, payload);
        return json(rendererAuthResponse(u.pathname, payload), upstream.status);
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
  if (saveFolder) await setSaveFolder(saveFolder);
  app.on('activate', () => { if (!mainWindow) void createWindow(ses); });
}).catch(() => { dialog.showErrorBox('Sindaris', 'Не удалось запустить приложение. Выполните сборку desktop заново.'); app.quit(); });
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.on('window-all-closed', () => { /* tray keeps the companion and local collection alive */ });
app.on('before-quit', () => {
  quitting = true;
  tray?.destroy();
  saveWatcher?.close();
  if (scanTimer) clearInterval(scanTimer);
  scanChild?.kill();
  void catalog?.close();
});
