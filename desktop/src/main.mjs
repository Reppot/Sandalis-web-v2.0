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
app.setName('Chronomancer');
if (process.platform === 'win32') app.setAppUserModelId('com.sindaris.terminal');
// Keep the existing local profile so auth state, preferences, and scan reports survive the rebrand.
app.setPath('userData', path.join(app.getPath('appData'), 'Sindaris'));
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let mainWindow;
let authWindow;
let catalog;
let tray;
let quitting = false;
let saveFolder = null;
let saveFile = null;
let saveWatcher = null;
let scanTimer = null;
let lastSaveSignature = null;
let scanInProgress = false;
let scanChild = null;
let companionStatus = { state: 'waiting', folder: null, fileName: null, stockpiles: [], incompleteCount: 0, message: 'Ищу MapData.sav в папке сохранений Foxhole…' };
let lastScanReport = null;
let reportFile = null;
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
  await writeFile(preferencesFile, JSON.stringify({ ...existing, offlineGuest: value, saveFolder, saveFile }), 'utf8');
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

function discordImage(value, directory) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'cdn.discordapp.com' && url.pathname.startsWith(`/${directory}/`) ? url.href : null;
  } catch { return null; }
}

async function companionProfile(ses) {
  if (offlineGuest) return null;
  try {
    const headers = new Headers();
    const authorization = nativeAuth.authorization(SERVER_URL + '/api/v1/auth/me');
    if (authorization) headers.set('Authorization', authorization);
    const response = await ses.fetch(SERVER_URL + '/api/v1/auth/me', {
      headers, credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) return undefined;
    const me = await response.json();
    if (me.subject_type !== 'user') return null;
    const level = me.role === 'owner' ? 'owner'
      : me.role === 'admin' ? 'high'
        : me.role === 'officer' ? 'medium'
          : me.role === 'member' ? 'basic'
            : (Array.isArray(me.scopes) && me.scopes.some((scope) => scope !== 'catalog:read')) ? 'custom' : 'guest';
    let clanName = typeof me.clan_id === 'string' ? me.clan_id : '';
    let clanAvatarUrl = null;
    try {
      const clanHeaders = new Headers();
      if (authorization) clanHeaders.set('Authorization', authorization);
      const clanResponse = await ses.fetch(SERVER_URL + '/api/v1/clan/profile', {
        headers: clanHeaders, credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(8000),
      });
      if (clanResponse.ok) {
        const clan = await clanResponse.json();
        clanName = typeof clan.name === 'string' ? clan.name : clanName;
        clanAvatarUrl = discordImage(clan.icon_url, 'icons');
      }
    } catch { /* Keep the clan ID when the profile endpoint is temporarily offline. */ }
    return {
      displayName: typeof me.display_name === 'string' ? me.display_name : me.user_id,
      avatarUrl: discordImage(me.avatar_url, 'avatars'),
      clanId: typeof me.clan_id === 'string' ? me.clan_id : '',
      clanName,
      clanAvatarUrl,
      level,
    };
  } catch { return undefined; }
}

async function getDiscordSetup(ses) {
  if (offlineGuest) return null;
  try {
    const response = await ses.fetch(SERVER_URL + '/api/v1/auth/discord/setup', {
      headers: { Accept: 'application/json' }, credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const setup = await response.json();
    const text = (value, max = 120) => typeof value === 'string' ? value.slice(0, max) : '';
    return {
      displayName: text(setup.display_name),
      guilds: Array.isArray(setup.guilds) ? setup.guilds.slice(0, 100).map((guild) => ({
        id: text(guild.id, 32), name: text(guild.name), iconUrl: discordImage(guild.icon_url, 'icons'),
        clanId: text(guild.clan_id, 64), clanName: text(guild.clan_name),
      })) : [],
      joins: Array.isArray(setup.joins) ? setup.joins.slice(0, 100).map((join) => ({
        clanId: text(join.clan_id, 64), name: text(join.name), iconUrl: discordImage(join.icon_url, 'icons'),
        level: ['basic', 'medium', 'high'].includes(join.level) ? join.level : 'basic',
        roles: Array.isArray(join.roles) ? join.roles.slice(0, 24).map((role) => text(role.name, 64)) : [],
      })) : [],
      memberships: Array.isArray(setup.memberships) ? setup.memberships.slice(0, 100).map((membership) => ({
        clanId: text(membership.clan_id, 64), clanName: text(membership.clan_name), role: text(membership.role, 32),
      })) : [],
    };
  } catch { return null; }
}

async function completeDiscordSetup(ses, selection) {
  const keys = ['guildId', 'clanId', 'joinClanId'].filter((key) => Object.hasOwn(selection ?? {}, key));
  if (keys.length !== 1) return { ok: false, error: 'Выберите один сервер или клан из списка.' };
  const key = keys[0];
  const value = selection[key];
  if (typeof value !== 'string' || value.length < 1 || value.length > 64 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return { ok: false, error: 'Вариант выбора сервера некорректен. Обновите список и попробуйте снова.' };
  }
  const fields = { guildId: 'guild_id', clanId: 'clan_id', joinClanId: 'join_clan_id' };
  const endpoint = SERVER_URL + '/api/v1/auth/discord/setup';
  try {
    const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
    const authorization = nativeAuth.authorization(endpoint);
    if (authorization) headers.set('Authorization', authorization);
    const response = await ses.fetch(endpoint, {
      method: 'POST', headers, body: JSON.stringify({ [fields[key]]: value }),
      credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(12000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: 'Сервер не применил этот выбор. Обновите список и попробуйте ещё раз.' };
    nativeAuth.capture('/api/v1/auth/discord/setup', 'POST', response.status, payload);
    await persistGuest(false);
    return { ok: true };
  } catch { return { ok: false, error: 'Не удалось связаться с сервером. Проверьте подключение и повторите выбор.' }; }
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
    const incomplete = [...new Map([...logs.matchAll(/fs-sav:\s+([A-Za-z0-9_-]{1,100})\s+at\s+([A-Za-z0-9_-]{1,100})\s+skipped: the game had no details for it/gi)]
      .map((match) => [`${match[1]}:${match[2]}`, { type: match[1], hex: match[2] }])).values()];
    const incompleteCount = [...logs.matchAll(/skipped: the game had no details for it/gi)].length;
    lastSaveSignature = signature;
    lastScanReport = {
      processedAt: new Date().toISOString(), fileName: path.basename(file),
      stockpiles, incomplete, incompleteCount, total: stockpiles.length + incompleteCount,
    };
    await writeFile(reportFile, JSON.stringify(lastScanReport), 'utf8');
    publishCompanionStatus({
      state: incompleteCount ? 'partial' : 'ready', folder: saveFolder, fileName: path.basename(file),
      stockpiles, incomplete, incompleteCount,
      message: incompleteCount
        ? `Распознано складов: ${stockpiles.length}. Ещё ${incompleteCount} закреплённых объектов без доступных деталей — они не считаются пустыми.`
        : `Обработка завершена. Найдено складов: ${stockpiles.length}.`,
      processedAt: lastScanReport.processedAt,
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
    const candidate = saveFile
      ? { file: saveFile, info: await stat(saveFile) }
      : await findSaveFile(saveFolder);
    if (!candidate) {
      publishCompanionStatus({ state: 'error', folder: saveFolder, fileName: null, stockpiles: [], incompleteCount: 0, processedAt: null, message: 'MapData.sav не найден. Нажмите «Найти файл» и выберите сохранение вручную.' });
      return;
    }
    const signature = `${candidate.file}:${candidate.info.size}:${candidate.info.mtimeMs}`;
    if (signature !== lastSaveSignature) await processSaveFile(candidate.file, signature);
  } catch (error) {
    const missing = error.code === 'ENOENT';
    publishCompanionStatus({
      state: 'error', folder: saveFolder, fileName: null, stockpiles: [], incompleteCount: 0,
      processedAt: null,
      message: missing
        ? saveFile
          ? 'Выбранный MapData.sav недоступен. Нажмите «Найти файл» и укажите актуальное сохранение.'
          : 'Автопоиск не нашёл MapData.sav. Нажмите «Найти файл», чтобы указать его вручную.'
        : `Не удалось прочитать сохранение: ${error.message}. Выберите файл вручную.`,
    });
  }
}

async function watchSaveFolder(folder) {
  lastSaveSignature = null;
  saveWatcher?.close();
  if (scanTimer) clearInterval(scanTimer);
  companionStatus = { state: 'waiting', folder, fileName: null, stockpiles: [], incompleteCount: 0, message: 'Ищу последнее сохранение Foxhole…' };
  if (folder) {
    try { saveWatcher = watch(folder, () => { void pollSaveFolder(); }); } catch { saveWatcher = null; }
    scanTimer = setInterval(() => void pollSaveFolder(), 2500);
    await pollSaveFolder();
  }
  return companionStatus;
}

async function setSaveFile(file) {
  if (!/_MapData\.sav$/i.test(path.basename(file))) {
    publishCompanionStatus({ state: 'error', folder: path.dirname(file), fileName: path.basename(file), message: 'Выберите файл Foxhole с именем *_MapData.sav.' });
    return companionStatus;
  }
  saveFile = file;
  saveFolder = path.dirname(file);
  const prefs = await readPreferences();
  await writeFile(preferencesFile, JSON.stringify({ ...prefs, offlineGuest, saveFolder, saveFile }), 'utf8');
  return watchSaveFolder(saveFolder);
}

function openExternal(value) {
  const safe = externalUrl(value);
  if (safe) void shell.openExternal(safe).catch(() => {});
}

function brandIcon() {
  const root = app.getAppPath();
  const iconPath = path.join(root, 'resources', 'chronomancer.ico');
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) return icon;
  return nativeImage.createFromPath(app.isPackaged
    ? path.join(process.resourcesPath, 'chronomancer-icon.png')
    : path.join(root, 'resources', 'chronomancer-icon.png'));
}

function openLogin(ses) {
  nativeAuth.clear();
  if (authWindow && !authWindow.isDestroyed()) { authWindow.focus(); return; }
  authWindow = new BrowserWindow({
    title: 'Chronomancer — вход через Discord', width: 760, height: 840, autoHideMenuBar: true,
    icon: brandIcon(),
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
      .catch(() => dialog.showErrorBox('Chronomancer', 'Не удалось сохранить состояние входа.'));
    auth.close();
  };
  auth.webContents.on('did-navigate', returned);
  auth.on('closed', () => { if (authWindow === auth) authWindow = null; });
  void auth.loadURL(SERVER_URL + '/api/v1/auth/discord/login?return_to=%2F').catch(() => {
    dialog.showErrorBox('Chronomancer', 'Не удалось открыть Discord. Проверьте подключение к интернету.');
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
    title: 'Chronomancer — Foxhole Logi', width: 1440, height: 960, minWidth: 900, minHeight: 640,
    icon: brandIcon(), frame: false, backgroundColor: '#0b090a', autoHideMenuBar: true, show: false,
    webPreferences: { session: ses, preload: path.join(app.getAppPath(), 'src', 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  const win = mainWindow;
  win.once('ready-to-show', () => win.show());
  const publishWindowState = () => win.webContents.send('window:maximized', win.isMaximized());
  win.on('maximize', publishWindowState);
  win.on('unmaximize', publishWindowState);
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
  saveFile = typeof preferences.saveFile === 'string' ? preferences.saveFile : null;
  saveFolder = typeof preferences.saveFolder === 'string'
    ? preferences.saveFolder
    : path.join(process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), 'Foxhole', 'Saved', 'SaveGames');
  if (saveFile) saveFolder = path.dirname(saveFile);
  const root = app.getAppPath();
  const resources = path.join(root, 'resources');
  catalog = createCatalog(path.join(resources, 'snapshot.json'));
  const ses = session.fromPartition('persist:sindaris-desktop');
  reportFile = path.join(app.getPath('userData'), 'last-scan-report.json');
  try {
    const report = JSON.parse(await readFile(reportFile, 'utf8'));
    lastScanReport = typeof report?.processedAt === 'string' && typeof report?.fileName === 'string'
      && Array.isArray(report?.stockpiles) && Number.isInteger(report?.incompleteCount) && Number.isInteger(report?.total)
      ? { ...report, incomplete: Array.isArray(report.incomplete) ? report.incomplete.filter((item) => typeof item?.type === 'string' && typeof item?.hex === 'string').slice(0, 500) : [] }
      : null;
  } catch { lastScanReport = null; }
  ipcMain.handle('companion:choose-save-file', async (event) => {
    if (!trustedIpc(event)) return companionStatus;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите файл Foxhole MapData.sav', properties: ['openFile'],
      filters: [{ name: 'Foxhole MapData', extensions: ['sav'] }],
    });
    if (result.canceled || !result.filePaths[0]) return companionStatus;
    return setSaveFile(result.filePaths[0]);
  });
  ipcMain.handle('companion:get-status', (event) => trustedIpc(event) ? companionStatus : null);
  ipcMain.handle('companion:get-profile', (event) => trustedIpc(event) ? companionProfile(ses) : null);
  ipcMain.handle('companion:get-last-report', (event) => trustedIpc(event) ? lastScanReport : null);
  ipcMain.handle('companion:get-discord-setup', (event) => trustedIpc(event) ? getDiscordSetup(ses) : null);
  ipcMain.handle('companion:complete-discord-setup', (event, selection) => trustedIpc(event) ? completeDiscordSetup(ses, selection) : { ok: false, error: 'Недопустимый источник запроса.' });
  ipcMain.handle('companion:discord-login', (event) => {
    if (!trustedIpc(event)) return false;
    openLogin(ses);
    return true;
  });
  ipcMain.handle('window:minimize', (event) => {
    if (!trustedIpc(event) || !mainWindow) return false;
    mainWindow.minimize();
    return true;
  });
  ipcMain.handle('window:toggle-maximize', (event) => {
    if (!trustedIpc(event) || !mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', (event) => {
    if (!trustedIpc(event) || !mainWindow) return false;
    mainWindow.close();
    return true;
  });
  ipcMain.handle('window:is-maximized', (event) => trustedIpc(event) ? Boolean(mainWindow?.isMaximized()) : false);
  // Closing the window keeps the local companion process alive. Quit is explicit in the tray.
  const trayImage = brandIcon();
  tray = new Tray(trayImage);
  tray.setToolTip('Chronomancer — Foxhole Logi работает');
  const trayMenu = Menu.buildFromTemplate([
    { label: 'Открыть Chronomancer', click: () => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.show(); mainWindow?.focus(); } },
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
  await watchSaveFolder(saveFolder);
  app.on('activate', () => { if (!mainWindow) void createWindow(ses); });
}).catch(() => { dialog.showErrorBox('Chronomancer', 'Не удалось запустить приложение. Выполните сборку desktop заново.'); app.quit(); });
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
