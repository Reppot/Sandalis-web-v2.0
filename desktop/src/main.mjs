import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, session, shell, Tray } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { watch } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import updaterModule from 'electron-updater';
import { APP_URL, SERVER_URL, isAppUrl, safeFile, isAuthNavigation, externalUrl, trustedRequest, sessionRequestPolicy, rendererAuthResponse, createNativeAuthSession } from './policy.mjs';
import { createCatalog } from './catalog-client.mjs';
import { guestProfile } from './local-api.mjs';
import { createDiagnosticsLogger, createZip, diagnosticErrorDetails, readDiagnosticLogs } from './diagnostics.mjs';

const { autoUpdater } = updaterModule;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }]);
app.setName('Chronum');
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
let scanUploadTimer = null;
let scanUploadAttempts = 0;
let scanUploadInProgress = false;
let pendingScanUpload = null;
let diagnostics;
let updateState = { status: 'idle', currentVersion: app.getVersion() };
let updateCheckInProgress = false;
let lastUpdateCheckAt = 0;
const UPDATE_CHECK_COOLDOWN_MS = 15 * 60 * 1000;
const UPDATE_RETRY_AFTER_ERROR_MS = 60 * 1000;
const API_WARMUP_TIMEOUT_MS = 75_000;
const API_RETRY_DELAYS_MS = [5_000, 15_000];
let desktopSession = null;
let lastSaveSignature = null;
let lastConnectivityProbeAt = 0;
let connectivityProbePromise = null;

const WINDOWS_LANGUAGE_IDS = new Map([
  [0x09, 'en'], [0x22, 'uk'], [0x19, 'ru'], [0x07, 'de'], [0x15, 'pl'],
  [0x0c, 'fr'], [0x0a, 'es'], [0x16, 'pt'], [0x05, 'cs'], [0x04, 'zh'],
]);
const SUPPORTED_LOCALES = new Set(['cs', 'de', 'en', 'es', 'fr', 'pl', 'pt', 'ru', 'uk', 'zh']);
const NATIVE_COPY = {
  'choose-save': ['Vyberte soubor Foxhole MapData.sav', 'Foxhole-MapData.sav-Datei auswählen', 'Choose Foxhole MapData.sav file', 'Selecciona el archivo Foxhole MapData.sav', 'Choisir le fichier Foxhole MapData.sav', 'Wybierz plik Foxhole MapData.sav', 'Escolher ficheiro Foxhole MapData.sav', 'Выберите файл Foxhole MapData.sav', 'Виберіть файл Foxhole MapData.sav', '选择 Foxhole MapData.sav 文件'],
  'tray-tip': ['Chronum — Foxhole Logi běží', 'Chronum — Foxhole Logi läuft', 'Chronum — Foxhole Logi is running', 'Chronum — Foxhole Logi está en ejecución', 'Chronum — Foxhole Logi est en cours d’exécution', 'Chronum — Foxhole Logi działa', 'Chronum — Foxhole Logi está em execução', 'Chronum — Foxhole Logi работает', 'Chronum — Foxhole Logi працює', 'Chronum — Foxhole Logi 正在运行'],
  'tray-open': ['Otevřít Chronum', 'Chronum öffnen', 'Open Chronum', 'Abrir Chronum', 'Ouvrir Chronum', 'Otwórz Chronum', 'Abrir Chronum', 'Открыть Chronum', 'Відкрити Chronum', '打开 Chronum'],
  'tray-exit': ['Ukončit', 'Beenden', 'Quit', 'Salir', 'Quitter', 'Zakończ', 'Sair', 'Выход', 'Вийти', '退出'],
  'login-title': ['Přihlásit se přes Discord — Chronum', 'Bei Discord anmelden — Chronum', 'Sign in with Discord — Chronum', 'Iniciar sesión con Discord — Chronum', 'Se connecter avec Discord — Chronum', 'Zaloguj się przez Discord — Chronum', 'Iniciar sessão com Discord — Chronum', 'Chronum — вход через Discord', 'Chronum — вхід через Discord', '通过 Discord 登录 — Chronum'],
  'login-save-error': ['Nepodařilo se uložit stav přihlášení.', 'Anmeldestatus konnte nicht gespeichert werden.', 'Could not save sign-in state.', 'No se pudo guardar el estado de inicio de sesión.', 'Impossible d’enregistrer l’état de connexion.', 'Nie udało się zapisać stanu logowania.', 'Não foi possível guardar o estado da sessão.', 'Не удалось сохранить состояние входа.', 'Не вдалося зберегти стан входу.', '无法保存登录状态。'],
  'login-open-error': ['Discord se nepodařilo otevřít. Zkontrolujte připojení k internetu.', 'Discord konnte nicht geöffnet werden. Prüfe deine Internetverbindung.', 'Could not open Discord. Check your internet connection.', 'No se pudo abrir Discord. Comprueba la conexión a internet.', 'Impossible d’ouvrir Discord. Vérifiez votre connexion Internet.', 'Nie udało się otworzyć Discorda. Sprawdź połączenie z internetem.', 'Não foi possível abrir o Discord. Verifique a ligação à Internet.', 'Не удалось открыть Discord. Проверьте подключение к интернету.', 'Не вдалося відкрити Discord. Перевірте підключення до інтернету.', '无法打开 Discord。请检查网络连接。'],
  'diagnostics-title': ['Uložit diagnostiku Chronum', 'Chronum-Diagnose speichern', 'Save Chronum diagnostics', 'Guardar diagnóstico de Chronum', 'Enregistrer le diagnostic Chronum', 'Zapisz diagnostykę Chronum', 'Guardar diagnóstico do Chronum', 'Сохранить диагностику Chronum', 'Зберегти діагностику Chronum', '保存 Chronum 诊断信息'],
};
let activeLocale = 'en';
function nativeText(key) {
  const index = ['cs', 'de', 'en', 'es', 'fr', 'pl', 'pt', 'ru', 'uk', 'zh'].indexOf(activeLocale);
  return NATIVE_COPY[key]?.[index] ?? NATIVE_COPY[key]?.[2] ?? key;
}

function localeFromTag(value) {
  const language = String(value ?? '').toLowerCase().split(/[-_]/)[0];
  if (language === 'be') return 'ru';
  if (language === 'sk') return 'cs';
  return SUPPORTED_LOCALES.has(language) ? language : 'en';
}

function defaultLocaleFromSystem() {
  if (process.platform === 'win32') {
    // The first HKCU preload entry is Windows' primary keyboard layout.
    // Read only this user's layout list; never change registry values.
    const result = spawnSync('reg.exe', ['query', 'HKCU\\Keyboard Layout\\Preload'], {
      encoding: 'utf8', windowsHide: true, timeout: 1500,
    });
    const layoutId = String(result.stdout ?? '').match(/REG_SZ\s+([0-9a-f]{8})/i)?.[1];
    if (layoutId) {
      const windowsLanguageId = Number.parseInt(layoutId.slice(-4), 16) & 0x03ff;
      const locale = WINDOWS_LANGUAGE_IDS.get(windowsLanguageId);
      if (locale) return locale;
    }
  }
  return localeFromTag(app.getLocale());
}
let scanInProgress = false;
let scanChild = null;
let continuousScanning = true;
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
const diagnosticRoute = (pathname) => pathname.replace(/\/[0-9a-f-]{12,}(?=\/|$)/gi, '/:id');
function updaterCacheDirectory() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'chronomancer-desktop-updater');
}

function isTransientApiFailure(failure) {
  const details = diagnosticErrorDetails(failure);
  return /ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_REFUSED|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE/i
    .test(`${details.errorCode ?? ''} ${details.errorMessage ?? ''}`);
}

function bodyByteLength(body) {
  if (typeof body === 'string') return Buffer.byteLength(body);
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  return 0;
}

async function fetchServerApi(ses, endpoint, init = {}, {
  timeoutMs = API_WARMUP_TIMEOUT_MS, retryTransient = false, retries = 0, requestId = null,
} = {}) {
  const target = new URL(endpoint);
  if (target.origin !== SERVER_URL || target.username || target.password) throw new Error('Invalid API origin');
  const method = String(init.method ?? 'GET').toUpperCase();
  const route = diagnosticRoute(target.pathname);
  const requestBytes = bodyByteLength(init.body);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const currentRequestId = attempt === 0 && requestId ? requestId : randomUUID();
    const headers = new Headers(init.headers);
    headers.set('X-Chronum-Request-ID', currentRequestId);
    const startedAt = Date.now();
    diagnostics?.info('api.request.started', {
      requestId: currentRequestId, method, route, timeoutMs, attempt: attempt + 1,
      requestBytes, nativeAuthorizationAttached: headers.has('Authorization'),
    });

    try {
      const response = await ses.fetch(target.href, {
        ...init,
        method,
        headers,
        credentials: init.credentials ?? 'include',
        redirect: init.redirect ?? 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      diagnostics?.info('api.response', {
        requestId: currentRequestId, method, route, statusCode: response.status,
        durationMs: Date.now() - startedAt, requestBytes, responseType: response.type,
        redirected: response.redirected,
      });

      if (retryTransient && [502, 503, 504].includes(response.status) && attempt < retries) {
        const delayMs = API_RETRY_DELAYS_MS[attempt] ?? 15_000;
        diagnostics?.warn('api.request.retry', {
          requestId: currentRequestId, method, route, attempt: attempt + 1,
          nextAttemptInMs: delayMs, statusCode: response.status,
        });
        await response.body?.cancel().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      return response;
    } catch (failure) {
      diagnostics?.warn('api.request.failed', {
        requestId: currentRequestId, method, route, timeoutMs,
        durationMs: Date.now() - startedAt, attempt: attempt + 1,
        ...diagnosticErrorDetails(failure),
      });
      if (!retryTransient || !isTransientApiFailure(failure) || attempt >= retries) throw failure;
      const delayMs = API_RETRY_DELAYS_MS[attempt] ?? 15_000;
      diagnostics?.warn('api.request.retry', {
        requestId: currentRequestId, method, route, attempt: attempt + 1,
        nextAttemptInMs: delayMs, reason: 'transient-transport-error',
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('API request retries exhausted');
}

function cleanupCompletedUpdaterDownload() {
  if (!process.argv.includes('--updated')) return;
  const pendingDirectory = path.join(updaterCacheDirectory(), 'pending');
  diagnostics?.info('updater.cache.pending-cleanup.scheduled', { delayMs: 60_000 });
  const timer = setTimeout(() => {
    void rm(pendingDirectory, { recursive: true, force: true }).then(() => {
      diagnostics?.info('updater.cache.pending-cleaned');
    }).catch((failure) => {
      diagnostics?.warn('updater.cache.pending-cleanup.failed', diagnosticErrorDetails(failure));
    });
  }, 60_000);
  timer.unref?.();
}

function diagnosticUrl(value, base = undefined) {
  try {
    const url = new URL(value, base);
    return { origin: url.origin, route: diagnosticRoute(url.pathname) };
  } catch { return { origin: null, route: null }; }
}
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

function publishUpdateState(patch) {
  updateState = { ...updateState, ...patch, currentVersion: app.getVersion() };
  mainWindow?.webContents.send('updates:state', updateState);
}

function configureUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (...args) => diagnostics?.info('updater.log', { level: 'info', message: args.map(String).join(' ').slice(0, 700) }),
    warn: (...args) => diagnostics?.warn('updater.log', { level: 'warn', message: args.map(String).join(' ').slice(0, 700) }),
    error: (...args) => diagnostics?.error('updater.log', { level: 'error', message: args.map(String).join(' ').slice(0, 700) }),
    debug: (...args) => diagnostics?.info('updater.log', { level: 'debug', message: args.map(String).join(' ').slice(0, 700) }),
  };
  autoUpdater.on('checking-for-update', () => {
    diagnostics?.info('update.check.started');
    publishUpdateState({ status: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    diagnostics?.info('update.available', { version: info.version });
    publishUpdateState({ status: 'available', availableVersion: info.version, releaseDate: info.releaseDate ?? null });
  });
  autoUpdater.on('update-not-available', (info) => {
    diagnostics?.info('update.current', { version: info.version });
    publishUpdateState({ status: 'current', availableVersion: null });
  });
  autoUpdater.on('download-progress', (progress) => {
    publishUpdateState({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress.percent))) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    diagnostics?.info('update.downloaded', { version: info.version });
    publishUpdateState({ status: 'downloaded', availableVersion: info.version, percent: 100 });
  });
  autoUpdater.on('error', (failure) => {
    diagnostics?.error('update.failed', diagnosticErrorDetails(failure));
    lastUpdateCheckAt = Math.max(0, Date.now() - UPDATE_CHECK_COOLDOWN_MS + UPDATE_RETRY_AFTER_ERROR_MS);
    publishUpdateState({ status: 'error' });
  });
}

async function checkForUpdates(force = false) {
  if (!app.isPackaged || updateCheckInProgress || quitting || (!force && Date.now() - lastUpdateCheckAt < UPDATE_CHECK_COOLDOWN_MS)) return updateState;
  updateCheckInProgress = true;
  lastUpdateCheckAt = Date.now();
  try {
    await autoUpdater.checkForUpdates();
  } catch (failure) {
    diagnostics?.warn('update.check.failed', diagnosticErrorDetails(failure));
    lastUpdateCheckAt = Math.max(0, Date.now() - UPDATE_CHECK_COOLDOWN_MS + UPDATE_RETRY_AFTER_ERROR_MS);
    publishUpdateState({ status: 'error' });
  } finally {
    updateCheckInProgress = false;
  }
  return updateState;
}

async function exportDiagnostics(event) {
  if (!trustedIpc(event) || !mainWindow || !diagnostics) return { ok: false };
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const selected = await dialog.showSaveDialog(mainWindow, {
    title: nativeText('diagnostics-title'),
    defaultPath: `Chronum-Diagnostics-${stamp}.zip`,
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
  });
  if (selected.canceled || !selected.filePath) return { canceled: true };
  await connectivityProbePromise?.catch(() => {});
  await diagnostics.info('diagnostics.export.requested');
  await diagnostics.flush();
  const helper = app.isPackaged ? path.join(process.resourcesPath, 'fs.exe') : path.join(app.getAppPath(), 'resources', 'fs.exe');
  let scannerHelperAvailable = false;
  try { scannerHelperAvailable = (await stat(helper)).isFile(); } catch { scannerHelperAvailable = false; }
  const environment = {
    createdAt: now.toISOString(),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    architecture: process.arch,
    windowsVersion: process.platform === 'win32' ? os.release() : null,
    locale: activeLocale,
    continuousScanning,
    scanState: companionStatus.state,
    lastScanAt: lastScanReport?.processedAt ?? null,
    saveFileConfigured: Boolean(saveFile || saveFolder),
    scannerHelperAvailable,
    updateState: updateState.status,
  };
  const logText = await readDiagnosticLogs(path.join(app.getPath('userData'), 'client-diagnostics.jsonl'));
  const archive = createZip([
    ['environment.json', JSON.stringify(environment, null, 2)],
    ['client.log', logText || 'No diagnostic events have been recorded yet.\n'],
    ['README.txt', 'Chronum diagnostic bundle. It excludes MapData.sav, stockpile contents, Discord tokens, cookies, and passwords.\n'],
  ]);
  await writeFile(selected.filePath, archive);
  await diagnostics.info('diagnostics.export.completed', { bytes: archive.length });
  return { ok: true };
}

function proxyKinds(config) {
  const modes = String(config ?? '').match(/(?:^|[;\s])(DIRECT|PROXY|HTTPS|SOCKS4|SOCKS5|QUIC)(?=$|[;\s])/gi) ?? [];
  return [...new Set(modes.map((mode) => mode.trim().toUpperCase()))];
}

function diagnoseApiConnectivity(ses, failedRequestId) {
  const now = Date.now();
  if (connectivityProbePromise) return connectivityProbePromise;
  if (now - lastConnectivityProbeAt < 60_000) {
    diagnostics?.info('network.diagnostic.skipped', { failedRequestId, reason: 'cooldown' });
    return Promise.resolve();
  }
  lastConnectivityProbeAt = now;
  connectivityProbePromise = (async () => {
    const host = new URL(SERVER_URL).hostname;
    const result = { failedRequestId, internetOnline: net.isOnline(), proxyModes: [], dns: null, apiHealth: null };
    const proxyStartedAt = Date.now();
    try {
      result.proxyModes = proxyKinds(await ses.resolveProxy(SERVER_URL));
      result.proxyResolutionMs = Date.now() - proxyStartedAt;
    } catch (failure) {
      result.proxyResolution = diagnosticErrorDetails(failure);
    }
    const dnsStartedAt = Date.now();
    try {
      const addresses = await lookup(host, { all: true, verbatim: true });
      result.dns = { ok: true, addressCount: addresses.length, families: [...new Set(addresses.map(({ family }) => family))], durationMs: Date.now() - dnsStartedAt };
    } catch (failure) {
      result.dns = { ok: false, durationMs: Date.now() - dnsStartedAt, ...diagnosticErrorDetails(failure) };
    }
    const healthStartedAt = Date.now();
    try {
      const response = await fetchServerApi(ses, `${SERVER_URL}/api/v1/health/live`, {
        method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'manual',
      }, { timeoutMs: API_WARMUP_TIMEOUT_MS });
      result.apiHealth = { ok: response.status >= 200 && response.status < 300, statusCode: response.status, durationMs: Date.now() - healthStartedAt };
      await response.body?.cancel().catch(() => {});
    } catch (failure) {
      result.apiHealth = { ok: false, durationMs: Date.now() - healthStartedAt, ...diagnosticErrorDetails(failure) };
    }
    result.classification = result.apiHealth?.ok === true
      ? 'api-host-reachable-check-failed-route'
      : result.apiHealth?.statusCode >= 500
        ? 'api-service-error'
        : result.dns?.ok === false && result.apiHealth?.ok !== true
        ? 'dns-or-proxy-resolution-failure'
        : !result.internetOnline
          ? 'windows-reports-offline'
          : result.apiHealth?.statusCode
            ? 'api-returned-unexpected-status'
            : 'api-transport-unreachable';
    await diagnostics?.warn('network.diagnostic.completed', result);
  })().catch((failure) => diagnostics?.warn('network.diagnostic.failed', diagnosticErrorDetails(failure)))
    .finally(() => { connectivityProbePromise = null; });
  void diagnostics?.info('network.diagnostic.started', { failedRequestId, apiHealthRoute: '/api/v1/health/live' });
  return connectivityProbePromise;
}

async function persistScanSync(report, sync) {
  if (lastScanReport?.processedAt === report.processedAt) {
    lastScanReport = { ...lastScanReport, sync };
    await writeFile(reportFile, JSON.stringify(lastScanReport), 'utf8').catch(() => {});
  }
  publishCompanionStatus({ sync });
}

async function queueScanUpload(ses, report) {
  if (!Array.isArray(report?.stockpiles)) return;
  if (!ses || offlineGuest) {
    await persistScanSync(report, { state: 'no-clan', message: 'Войдите через Discord и выберите сервер для синхронизации.' });
    return;
  }
  const stockpiles = report.stockpiles
    .filter((stockpile) => typeof stockpile?.name === 'string' && stockpile.name.trim().length > 0
      && typeof stockpile.type === 'string' && typeof stockpile.hex === 'string'
      && Number.isFinite(stockpile.coords?.x) && Number.isFinite(stockpile.coords?.y)
      && Array.isArray(stockpile.items))
    .map((stockpile) => ({
      name: stockpile.name,
      type: stockpile.type,
      faction: typeof stockpile.faction === 'string' ? stockpile.faction : null,
      hex: stockpile.hex,
      town: typeof stockpile.town === 'string' ? stockpile.town : null,
      coords: { x: stockpile.coords.x, y: stockpile.coords.y },
      items: stockpile.items.filter((item) => typeof item?.code === 'string'
        && Number.isSafeInteger(item.quantity) && item.quantity > 0 && typeof item.crated === 'boolean')
        .map((item) => ({ item_code: item.code, quantity: item.quantity, crated: item.crated }))
        .sort((a, b) => a.item_code.localeCompare(b.item_code) || Number(a.crated) - Number(b.crated)),
    }))
    .sort((a, b) => a.hex.localeCompare(b.hex) || a.type.localeCompare(b.type)
      || a.coords.x - b.coords.x || a.coords.y - b.coords.y);
  if (stockpiles.length === 0) {
    await persistScanSync(report, { state: 'no-named-stocks', message: 'Нет складов с именем из игры для синхронизации.' });
    return;
  }

  const canonical = JSON.stringify({ version: 1, stockpiles });
  const hash = createHash('sha256').update(canonical).digest('hex');
  diagnostics?.info('scan.upload.prepared', { stockpileCount: stockpiles.length, payloadBytes: Buffer.byteLength(canonical) });
  const clanId = await currentClanId(ses);
  if (!clanId) {
    await persistScanSync(report, { state: 'no-clan', message: 'Выберите сервер Discord и войдите, чтобы синхронизировать скан.' });
    return;
  }

  const preferences = await readPreferences();
  const hashes = preferences.scanUploadHashes && typeof preferences.scanUploadHashes === 'object'
    ? preferences.scanUploadHashes : {};
  if (hashes[clanId] === hash) {
    await persistScanSync(report, { state: 'synced', message: 'Изменений нет — данные уже синхронизированы.', clanId });
    return;
  }
  pendingScanUpload = {
    report, hash, clanId, startedAt: Date.now(),
    body: JSON.stringify({ version: 1, scanned_at: report.processedAt, stockpiles }),
  };
  scanUploadAttempts = 0;
  if (scanUploadTimer) clearTimeout(scanUploadTimer);
  void runScanUpload(ses);
}

async function runScanUpload(ses) {
  if (!pendingScanUpload || scanUploadInProgress || quitting) return;
  scanUploadInProgress = true;
  const current = pendingScanUpload;
  await persistScanSync(current.report, { state: 'uploading', message: 'Отправляю обработанные склады в API…', clanId: current.clanId });
  try {
    if (scanUploadAttempts > 0) {
      const activeClanId = await currentClanId(ses);
      if (activeClanId !== current.clanId) {
        pendingScanUpload = null;
        await persistScanSync(current.report, { state: 'no-clan', message: 'Активный сервер изменился. Новый скан будет отправлен в выбранный клан.', clanId: activeClanId });
        return;
      }
    }
    const endpoint = SERVER_URL + '/api/v1/stockpiles/import-scan';
    const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json' });
    const authorization = nativeAuth.authorization(endpoint);
    if (authorization) headers.set('Authorization', authorization);
    const response = await fetchServerApi(ses, endpoint, {
      method: 'POST', headers, body: current.body,
    }, { timeoutMs: API_WARMUP_TIMEOUT_MS });
    diagnostics?.info('scan.upload.response', { statusCode: response.status, durationMs: Date.now() - (current.startedAt ?? Date.now()) });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      const preferences = await readPreferences();
      const hashes = preferences.scanUploadHashes && typeof preferences.scanUploadHashes === 'object'
        ? preferences.scanUploadHashes : {};
      hashes[current.clanId] = current.hash;
      await writeFile(preferencesFile, JSON.stringify({ ...preferences, scanUploadHashes: hashes }), 'utf8');
      pendingScanUpload = null;
      scanUploadAttempts = 0;
      await persistScanSync(current.report, {
        state: 'synced', message: result.message || 'Скан синхронизирован с базой клана.',
        clanId: current.clanId, created: result.created, updated: result.updated,
      });
    } else if (response.status === 401 || response.status === 403 || response.status === 422 || response.status === 409) {
      pendingScanUpload = null;
      await persistScanSync(current.report, {
        state: 'rejected', message: response.status === 401 ? 'Войдите через Discord для синхронизации.'
          : response.status === 403 ? 'У вашей роли нет права загружать содержимое складов.'
            : typeof result?.error?.message === 'string' ? result.error.message : 'Сервер отклонил данные скана.',
        clanId: current.clanId,
      });
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch {
    scanUploadAttempts += 1;
    diagnostics?.warn('scan.upload.retry', { attempt: scanUploadAttempts });
    await persistScanSync(current.report, { state: 'retrying', message: 'API временно недоступен. Повторю отправку позже.', clanId: current.clanId });
    const delay = Math.min(300_000, 5_000 * (2 ** Math.min(scanUploadAttempts - 1, 6)));
    scanUploadTimer = setTimeout(() => void runScanUpload(ses), delay);
  } finally {
    scanUploadInProgress = false;
  }
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
    const response = await fetchServerApi(ses, SERVER_URL + '/api/v1/auth/me', { headers }, {
      timeoutMs: API_WARMUP_TIMEOUT_MS, retryTransient: true, retries: API_RETRY_DELAYS_MS.length,
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
      const clanResponse = await fetchServerApi(ses, SERVER_URL + '/api/v1/clan/profile', { headers: clanHeaders }, {
        timeoutMs: API_WARMUP_TIMEOUT_MS, retryTransient: true, retries: API_RETRY_DELAYS_MS.length,
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

async function currentClanId(ses) {
  if (offlineGuest) return null;
  try {
    const endpoint = SERVER_URL + '/api/v1/auth/me';
    const headers = new Headers();
    const authorization = nativeAuth.authorization(endpoint);
    if (authorization) headers.set('Authorization', authorization);
    const response = await fetchServerApi(ses, endpoint, { headers }, {
      timeoutMs: API_WARMUP_TIMEOUT_MS, retryTransient: true, retries: API_RETRY_DELAYS_MS.length,
    });
    if (!response.ok) return null;
    const me = await response.json();
    return me.subject_type === 'user' && typeof me.clan_id === 'string' ? me.clan_id : null;
  } catch { return null; }
}

async function getDiscordSetup(ses) {
  if (offlineGuest) return null;
  try {
    const response = await fetchServerApi(ses, SERVER_URL + '/api/v1/auth/discord/setup', {
      headers: { Accept: 'application/json' },
    }, { timeoutMs: API_WARMUP_TIMEOUT_MS, retryTransient: true, retries: API_RETRY_DELAYS_MS.length });
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
    const response = await fetchServerApi(ses, endpoint, {
      method: 'POST', headers, body: JSON.stringify({ [fields[key]]: value }),
    }, { timeoutMs: API_WARMUP_TIMEOUT_MS });
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
  if (scanInProgress || !file || quitting || !continuousScanning) return;
  scanInProgress = true;
  const scanStartedAt = Date.now();
  let fileSize = null;
  try { fileSize = (await stat(file)).size; } catch { /* The scanner reports the useful read error below. */ }
  diagnostics?.info('scan.started', { fileSize, scannerTimeoutMs: 90_000 });
  publishCompanionStatus({ state: 'processing', folder: saveFolder, fileName: path.basename(file), message: 'Читаю MapData.sav локально…' });
  const helper = app.isPackaged
    ? path.join(process.resourcesPath, 'fs.exe')
    : path.join(app.getAppPath(), 'resources', 'fs.exe');
  const tempDir = path.join(app.getPath('temp'), `chronum-scan-${randomUUID()}`);
  const output = path.join(tempDir, 'processed-scan.json');
  let logs = '';
  let stderr = '';
  try {
    await mkdir(tempDir, { recursive: true });
    await stat(helper);
    await new Promise((resolve, reject) => {
      const child = spawn(helper, ['sav', '--file', file, '--once', '--output', output], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        // Keep both the parser's one-file extraction and its JSON output inside
        // one app-owned directory that is removed after every scan.
        env: { ...process.env, TEMP: tempDir, TMP: tempDir, TMPDIR: tempDir, FS_OUTPUT__HANDLERS: '[]' },
      });
      scanChild = child;
      child.stdout.on('data', (chunk) => { if (logs.length < 512_000) logs += chunk.toString().slice(0, 512_000 - logs.length); });
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        if (logs.length < 512_000) logs += text.slice(0, 512_000 - logs.length);
        if (stderr.length < 16_000) stderr += text.slice(0, 16_000 - stderr.length);
      });
      child.once('error', reject);
      child.once('close', (code) => {
        if (scanChild === child) scanChild = null;
        clearTimeout(timeout);
        diagnostics?.info('scan.helper.closed', { exitCode: code, durationMs: Date.now() - scanStartedAt });
        code === 0 ? resolve() : reject(new Error(`fs-sav завершился с кодом ${code}`));
      });
      const timeout = setTimeout(() => {
        diagnostics?.error('scan.helper.timeout', { timeoutMs: 90_000, durationMs: Date.now() - scanStartedAt });
        child.kill();
        reject(new Error('Сканер не завершился за 90 секунд.'));
      }, 90_000);
    });
    if (stderr.trim()) diagnostics?.warn('scan.helper.stderr', {
      stderrBytes: Buffer.byteLength(stderr),
      stderrLineCount: stderr.trim().split(/\r?\n/).length,
      containsError: /error|exception|failed|ошибка|сбой/i.test(stderr),
    });
    if (!continuousScanning || quitting) return;
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
    diagnostics?.info('scan.completed', { stockpileCount: stockpiles.length, incompleteCount, durationMs: Date.now() - scanStartedAt });
    publishCompanionStatus({
      state: incompleteCount ? 'partial' : 'ready', folder: saveFolder, fileName: path.basename(file),
      stockpiles, incomplete, incompleteCount,
      message: incompleteCount
        ? `Распознано складов: ${stockpiles.length}. Ещё ${incompleteCount} закреплённых объектов без доступных деталей — они не считаются пустыми.`
        : `Обработка завершена. Найдено складов: ${stockpiles.length}.`,
      processedAt: lastScanReport.processedAt,
    });
    void queueScanUpload(desktopSession, lastScanReport);
  } catch (error) {
    diagnostics?.error('scan.failed', { code: error.code ?? null, error: error.message, durationMs: Date.now() - scanStartedAt });
    if (!continuousScanning) return;
    publishCompanionStatus({ state: 'error', folder: saveFolder, fileName: path.basename(file), message: error.code === 'ENOENT' ? 'Локальный обработчик fs.exe не найден. Пересоберите приложение.' : `Не удалось прочитать сохранение: ${error.message}` });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    scanInProgress = false;
  }
}

async function pollSaveFolder() {
  if (!continuousScanning || !saveFolder || quitting || scanInProgress) return;
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
  if (!continuousScanning) {
    publishCompanionStatus({ state: 'paused', message: 'Постоянное сканирование выключено. Включите его, чтобы следить за обновлениями MapData.sav.' });
  } else if (folder) {
    try { saveWatcher = watch(folder, () => { void pollSaveFolder(); }); } catch { saveWatcher = null; }
    scanTimer = setInterval(() => void pollSaveFolder(), 2500);
    await pollSaveFolder();
  }
  return companionStatus;
}

async function clearAbandonedScanTemps() {
  const tempRoot = app.getPath('temp');
  for (const entry of await readdir(tempRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !entry.name.startsWith('chronum-scan-')) continue;
    await rm(path.join(tempRoot, entry.name), { recursive: true, force: true }).catch(() => {});
  }
}

async function setContinuousScanning(enabled) {
  continuousScanning = enabled;
  const prefs = await readPreferences();
  await writeFile(preferencesFile, JSON.stringify({ ...prefs, offlineGuest, saveFolder, saveFile, continuousScanning }), 'utf8');
  if (!enabled) {
    saveWatcher?.close(); saveWatcher = null;
    if (scanTimer) clearInterval(scanTimer);
    scanTimer = null;
    scanChild?.kill();
    publishCompanionStatus({ state: 'paused', message: 'Постоянное сканирование выключено. Сохранение и предыдущий отчёт не изменены.' });
    return companionStatus;
  }
  return watchSaveFolder(saveFolder);
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
  const loginUrl = SERVER_URL + '/api/v1/auth/discord/login?return_to=%2F';
  diagnostics?.info('auth.login.window.opened', { target: diagnosticUrl(loginUrl) });
  authWindow = new BrowserWindow({
    title: nativeText('login-title'), width: 760, height: 840, autoHideMenuBar: true,
    icon: brandIcon(),
    parent: mainWindow,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const auth = authWindow;
  auth.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  auth.webContents.on('did-start-navigation', (_event, url, _isInPlace, isMainFrame) => {
    diagnostics?.info('auth.login.navigation.started', { target: diagnosticUrl(url), isMainFrame });
  });
  auth.webContents.on('did-redirect-navigation', (_event, url, _isInPlace, isMainFrame) => {
    diagnostics?.info('auth.login.navigation.redirected', { target: diagnosticUrl(url), isMainFrame });
  });
  auth.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    diagnostics?.warn('auth.login.navigation.failed', {
      errorCode, errorDescription, target: diagnosticUrl(validatedURL), isMainFrame,
    });
  });
  const guard = (event, url) => { if (!isAuthNavigation(url)) event.preventDefault(); };
  auth.webContents.on('will-navigate', guard);
  auth.webContents.on('will-redirect', guard);
  const returned = (_event, value) => {
    const u = new URL(value);
    if (u.origin !== SERVER_URL || u.pathname !== '/') return;
    diagnostics?.info('auth.login.callback', {
      hasSetupSelection: u.searchParams.get('setup') === 'guild',
      errorCode: u.searchParams.get('error')?.slice(0, 80) ?? null,
    });
    // Cookies stay in the persistent session; only the non-secret UI state returns.
    const query = new URLSearchParams();
    if (u.searchParams.get('setup') === 'guild') query.set('setup', 'guild');
    if (u.searchParams.has('error')) query.set('error', u.searchParams.get('error').slice(0, 100));
    void persistGuest(false).then(() => mainWindow?.webContents.send('auth:complete', Object.fromEntries(query)))
      .catch(() => dialog.showErrorBox('Chronum', nativeText('login-save-error')));
    auth.close();
  };
  auth.webContents.on('did-navigate', returned);
  auth.on('closed', () => { if (authWindow === auth) authWindow = null; });
  const loadLogin = async (attempt = 0) => {
    if (auth.isDestroyed() || auth.webContents.isDestroyed()) return;
    try {
      diagnostics?.info('auth.login.navigation.starting', { attempt: attempt + 1, maxAttempts: 4 });
      await auth.loadURL(loginUrl);
    } catch (failure) {
      const aborted = /ERR_ABORTED|ERR_FAILED -3/i.test(`${failure?.code ?? ''} ${failure?.message ?? ''}`);
      if (aborted || auth.isDestroyed() || auth.webContents.isDestroyed()) return;
      if (isTransientApiFailure(failure) && attempt < 3) {
        const delayMs = [5_000, 15_000, 30_000][attempt];
        diagnostics?.warn('auth.login.navigation.retry', {
          attempt: attempt + 1, nextAttemptInMs: delayMs, ...diagnosticErrorDetails(failure),
        });
        setTimeout(() => { void loadLogin(attempt + 1); }, delayMs);
        return;
      }
      diagnostics?.error('auth.login.navigation.start.failed', {
        attempt: attempt + 1, ...diagnosticErrorDetails(failure),
      });
      if (!auth.isDestroyed()) dialog.showErrorBox('Chronum', nativeText('login-open-error'));
    }
  };
  void loadLogin();
}

async function fileResponse(ses, root, pathname) {
  const file = safeFile(root, pathname);
  // Bundled directories only, never user-provided filesystem paths.
  if (!(await stat(file)).isFile()) return new Response('Not found', { status: 404 });
  return ses.fetch(pathToFileURL(file).href);
}

async function createWindow(ses) {
  mainWindow = new BrowserWindow({
    title: 'Chronum — Foxhole Logi', width: 1440, height: 960, minWidth: 900, minHeight: 640,
    icon: brandIcon(), frame: false, backgroundColor: '#0b090a', autoHideMenuBar: true, show: false,
    webPreferences: { session: ses, preload: path.join(app.getAppPath(), 'src', 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  const win = mainWindow;
  win.once('ready-to-show', () => win.show());
  const publishWindowState = () => win.webContents.send('window:maximized', win.isMaximized());
  win.on('maximize', publishWindowState);
  win.on('unmaximize', publishWindowState);
  win.on('focus', () => { void checkForUpdates(); });
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
  diagnostics = createDiagnosticsLogger(path.join(app.getPath('userData'), 'client-diagnostics.jsonl'));
  await diagnostics.info('app.started', {
    appVersion: app.getVersion(), electronVersion: process.versions.electron,
    platform: process.platform, architecture: process.arch, locale: defaultLocaleFromSystem(),
  });
  const updaterCache = updaterCacheDirectory();
  const cachedInstaller = await stat(path.join(updaterCache, 'installer.exe')).catch(() => null);
  const cachedBlockMap = await stat(path.join(updaterCache, 'current.blockmap')).catch(() => null);
  const pendingUpdate = await stat(path.join(updaterCache, 'pending')).catch(() => null);
  diagnostics?.info('updater.cache.state', {
    installerPresent: Boolean(cachedInstaller?.isFile()),
    installerBytes: cachedInstaller?.isFile() ? cachedInstaller.size : 0,
    blockMapPresent: Boolean(cachedBlockMap?.isFile()),
    pendingDirectoryPresent: Boolean(pendingUpdate?.isDirectory()),
  });
  cleanupCompletedUpdaterDownload();
  configureUpdater();
  const preferences = await readPreferences();
  offlineGuest = preferences.offlineGuest === true;
  continuousScanning = preferences.continuousScanning !== false;
  saveFile = typeof preferences.saveFile === 'string' ? preferences.saveFile : null;
  saveFolder = typeof preferences.saveFolder === 'string'
    ? preferences.saveFolder
    : path.join(process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), 'Foxhole', 'Saved', 'SaveGames');
  if (saveFile) saveFolder = path.dirname(saveFile);
  const root = app.getAppPath();
  const resources = path.join(root, 'resources');
  catalog = createCatalog(path.join(resources, 'snapshot.json'));
  const ses = session.fromPartition('persist:sindaris-desktop');
  desktopSession = ses;
  await clearAbandonedScanTemps();
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
      title: nativeText('choose-save'), properties: ['openFile'],
      filters: [{ name: 'Foxhole MapData', extensions: ['sav'] }],
    });
    if (result.canceled || !result.filePaths[0]) return companionStatus;
    return setSaveFile(result.filePaths[0]);
  });
  ipcMain.handle('companion:get-status', (event) => trustedIpc(event) ? companionStatus : null);
  ipcMain.handle('diagnostics:export', (event) => exportDiagnostics(event));
  ipcMain.handle('updates:get-state', (event) => trustedIpc(event) ? updateState : null);
  ipcMain.handle('updates:check', async (event) => {
    if (!trustedIpc(event)) return null;
    await checkForUpdates(true);
    return updateState;
  });
  ipcMain.handle('updates:download', async (event) => {
    if (!trustedIpc(event) || updateState.status !== 'available') return false;
    publishUpdateState({ status: 'downloading', percent: 0 });
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (failure) {
      diagnostics?.error('update.download.failed', { error: failure?.message ?? 'unknown' });
      publishUpdateState({ status: 'error' });
      return false;
    }
  });
  ipcMain.handle('updates:install', (event) => {
    if (!trustedIpc(event) || updateState.status !== 'downloaded') return false;
    diagnostics?.info('update.install.started', { version: updateState.availableVersion });
    quitting = true;
    autoUpdater.quitAndInstall(false, true);
    return true;
  });
  ipcMain.handle('app:get-default-locale', (event) => trustedIpc(event) ? defaultLocaleFromSystem() : 'en');
  ipcMain.handle('app:set-locale', (event, value) => {
    if (!trustedIpc(event) || !SUPPORTED_LOCALES.has(value)) return false;
    activeLocale = value;
    if (tray && !tray.isDestroyed()) {
      tray.setToolTip(nativeText('tray-tip'));
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: nativeText('tray-open'), click: () => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.show(); mainWindow?.focus(); } },
        { type: 'separator' },
        { label: nativeText('tray-exit'), click: () => { quitting = true; app.quit(); } },
      ]));
    }
    return true;
  });
  ipcMain.handle('companion:set-continuous-scanning', (event, enabled) => trustedIpc(event) && typeof enabled === 'boolean' ? setContinuousScanning(enabled) : companionStatus);
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
  tray.setToolTip(nativeText('tray-tip'));
  const trayMenu = Menu.buildFromTemplate([
    { label: nativeText('tray-open'), click: () => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: nativeText('tray-exit'), click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(trayMenu);
  tray.on('double-click', () => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.show(); mainWindow?.focus(); });
  ses.setPermissionRequestHandler((_wc, permission, done) => done(permission === 'clipboard-sanitized-write'));
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write');
  ses.protocol.handle('app', async (request) => {
    if (!trustedRequest(request)) return error('Недопустимый источник запроса', 403);
    const u = new URL(request.url);
    const apiRequestId = randomUUID();
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
      const canRetryRead = ['GET', 'HEAD'].includes(request.method);
      const upstream = await fetchServerApi(ses, SERVER_URL + u.pathname + u.search, {
        method: request.method, headers, body, credentials: 'include', redirect: 'manual',
      }, {
        timeoutMs: policy.timeout,
        retryTransient: canRetryRead,
        retries: canRetryRead ? API_RETRY_DELAYS_MS.length : 0,
        requestId: apiRequestId,
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        diagnostics?.warn('api.redirect.blocked', {
          requestId: apiRequestId,
          method: request.method,
          route: diagnosticRoute(u.pathname),
          statusCode: upstream.status,
          target: diagnosticUrl(upstream.headers.get('location') ?? '', SERVER_URL),
        });
        return error('Неожиданное перенаправление сервера', 502);
      }
      const responseHeaders = new Headers();
      for (const name of ['content-type', 'content-language', 'content-disposition', 'x-chronum-request-id']) {
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
      if (u.pathname.startsWith('/api/')) void diagnoseApiConnectivity(ses, apiRequestId);
      if ([400, 404].includes(e.status)) return error(e.message, e.status);
      if (e instanceof URIError || e.message === 'Invalid asset path') return error('Недопустимый путь', 400);
      if (e.code === 'ENOENT') return new Response('Not found', { status: 404 });
      return error('Сайт временно не ответил. Повторите запрос через минуту. Локальные справочники доступны в гостевом режиме.');
    }
  });
  await createWindow(ses);
  void checkForUpdates();
  await watchSaveFolder(saveFolder);
  app.on('activate', () => {
    if (!mainWindow) void createWindow(ses);
    void checkForUpdates();
  });
}).catch(() => { dialog.showErrorBox('Chronum', 'Не удалось запустить приложение. Выполните сборку desktop заново.'); app.quit(); });
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  void checkForUpdates(true);
});
app.on('window-all-closed', () => { /* tray keeps the companion and local collection alive */ });
app.on('before-quit', () => {
  quitting = true;
  tray?.destroy();
  saveWatcher?.close();
  if (scanTimer) clearInterval(scanTimer);
  scanChild?.kill();
  void catalog?.close();
});
