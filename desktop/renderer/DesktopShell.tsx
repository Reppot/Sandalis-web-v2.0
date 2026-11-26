import * as React from 'react';
import { STORAGE_KEYS } from '@/shared/lib/storage';
import { useDesktopLocale, type DesktopLocale } from './desktop-i18n';
import './desktop.css';

type DesktopTab = 'companion' | 'links' | 'report' | 'tools' | 'clan' | 'guide' | 'feedback' | 'mail' | 'support' | 'cabinet';
type ScanStatus = {
  state: 'waiting' | 'processing' | 'ready' | 'partial' | 'error' | 'paused';
  folder: string | null;
  fileName: string | null;
  message: string;
  stockpiles?: Array<Record<string, unknown>>;
  incomplete?: Array<{ type: string; hex: string }>;
  incompleteCount?: number;
  processedAt?: string | null;
  sync?: { state: string; message: string; clanId?: string; created?: number; updated?: number };
};
type CompanionProfile = { displayName: string; avatarUrl: string | null; clanId: string; clanName: string; clanAvatarUrl: string | null; level: 'owner' | 'high' | 'medium' | 'basic' | 'custom' | 'guest' };
type ScanReport = { processedAt: string; fileName: string; stockpiles: Array<Record<string, unknown>>; incomplete?: Array<{ type: string; hex: string }>; incompleteCount: number; total: number; sync?: ScanStatus['sync'] };
type UpdateState = { status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'error'; currentVersion?: string; availableVersion?: string | null; percent?: number };
type DiscordSetup = {
  displayName: string;
  guilds: Array<{ id: string; name: string; iconUrl: string | null; clanId: string; clanName: string }>;
  joins: Array<{ clanId: string; name: string; iconUrl: string | null; level: string; roles: string[] }>;
  memberships: Array<{ clanId: string; clanName: string; role: string }>;
};
type DiscordChoice = { guildId?: string; clanId?: string; joinClanId?: string };
type DesktopApi = {
  chooseSaveFile: () => Promise<ScanStatus>;
  getCompanionStatus: () => Promise<ScanStatus>;
  setContinuousScanning: (enabled: boolean) => Promise<ScanStatus>;
  getCompanionProfile: () => Promise<CompanionProfile | null | undefined>;
  getLastScanReport: () => Promise<ScanReport | null>;
  exportDiagnostics: () => Promise<{ ok?: boolean; canceled?: boolean }>;
  getUpdateState: () => Promise<UpdateState | null>;
  checkForUpdates: () => Promise<UpdateState | null>;
  downloadUpdate: () => Promise<boolean>;
  installUpdate: () => Promise<boolean>;
  getDiscordSetup: () => Promise<DiscordSetup | null>;
  completeDiscordSetup: (selection: DiscordChoice) => Promise<{ ok: boolean; error?: string }>;
  openDiscordLogin: () => Promise<boolean>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onWindowMaximized: (callback: (maximized: boolean) => void) => () => void;
  getDefaultLocale: () => Promise<string>;
  onCompanionStatus: (callback: (status: ScanStatus) => void) => () => void;
  onUpdateState: (callback: (state: UpdateState) => void) => () => void;
  onAuthComplete: (callback: (state: Record<string, string>) => void) => () => void;
};

const getApi = () => typeof window === 'undefined' ? undefined : (window as Window & { chronomancerDesktop?: DesktopApi }).chronomancerDesktop;
const dateLocale: Record<DesktopLocale, string> = { cs: 'cs-CZ', de: 'de-DE', en: 'en-GB', es: 'es-ES', fr: 'fr-FR', pl: 'pl-PL', pt: 'pt-BR', ru: 'ru-RU', uk: 'uk-UA', zh: 'zh-CN' };
const labelSource: Record<DesktopTab, string> = {
  companion: 'Компаньон', links: 'Разделы Chronum', report: 'Последний отчёт', tools: 'Инструменты', clan: 'Клан', guide: 'Руководство',
  feedback: 'Обратная связь', mail: 'Почта', support: 'Поддержка', cabinet: 'Настройки',
};
const sections = Object.keys(labelSource).filter((key) => !['companion', 'links', 'report'].includes(key)) as Exclude<DesktopTab, 'companion' | 'links' | 'report'>[];
const sectionDetailSource: Record<Exclude<DesktopTab, 'companion' | 'links' | 'report'>, string> = {
  tools: 'Производственные калькуляторы и рабочие инструменты.', clan: 'Склады, заказы и состояние клана.',
  guide: 'Обучение и справочные материалы Chronum.', feedback: 'Обратная связь команде проекта.',
  mail: 'Уведомления и сообщения аккаунта.', support: 'Помощь и контакты поддержки.', cabinet: 'Профиль и параметры аккаунта.',
};
const statusNameSource: Record<ScanStatus['state'], string> = {
  waiting: 'Поиск файла', processing: 'Сканирование', ready: 'Готово', partial: 'Есть недоступные детали', error: 'Нужно выбрать файл', paused: 'Сканирование выключено',
};
const fmt = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
const stockpileNames: Record<string, string> = {
  RelicBase1: 'Реликтовая база', FortBaseT2: 'Бункерная база · тип T2', FortBaseT3: 'Бункерная база · тип T3',
  Seaport: 'Морской порт', TownBase1: 'Ратуша',
};
const factionNames: Record<string, string> = { Wardens: 'Вардены', Colonials: 'Колониалы' };
const hexNames: Record<string, string> = {
  WeatheredExpanseHex: 'Weathered Expanse', SableportHex: 'Sableport', FarranacCoastHex: 'Farranac Coast',
  LochMorHex: 'Loch Mor', UmbralWildwoodHex: 'Umbral Wildwood', KalokaiHex: 'Kalokai',
  WestgateHex: 'Westgate', StonecradleHex: 'Stonecradle',
};
const readableCode = (value: string) => value.replace(/Hex$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
const localizedScanMessage = (status: ScanStatus, t: (text: string, params?: Record<string, string | number>) => string) => {
  if (status.state === 'processing') return t('Читаю MapData.sav локально…');
  if (status.state === 'partial') return t('Распознано складов: {n}. Ещё {count} закреплённых объектов без доступных деталей — они не считаются пустыми.', { n: status.stockpiles?.length ?? 0, count: status.incompleteCount ?? 0 });
  if (status.state === 'ready') return t('Обработка завершена. Найдено складов: {n}.', { n: status.stockpiles?.length ?? 0 });
  if (status.state === 'paused') return t('Постоянное сканирование выключено. Включите его, чтобы следить за обновлениями MapData.sav.');
  if (status.state === 'error') return t(status.fileName ? 'Не удалось прочитать сохранение. Проверьте файл и повторите сканирование.' : 'MapData.sav не найден. Нажмите «Найти файл» и выберите сохранение вручную.');
  if (status.state === 'waiting') return t('Поиск файла MapData.sav в сохранениях Foxhole.');
  return t(status.message);
};
const localizedSyncMessage = (sync: ScanStatus['sync'], t: (text: string) => string) => {
  if (!sync) return '';
  const stateDefaults: Record<string, string> = {
    uploading: 'Отправляю обработанные склады в API…', synced: 'Скан синхронизирован с базой клана.',
    'no-clan': 'Войдите через Discord и выберите сервер для синхронизации.',
    'no-named-stocks': 'Нет складов с именем из игры для синхронизации.',
    retrying: 'API временно недоступен. Повторю отправку позже.',
    rejected: 'Сервер отклонил данные скана.',
  };
  return t(sync.message) !== sync.message ? t(sync.message) : t(stateDefaults[sync.state] ?? 'Статус синхронизации обновлён.');
};

function QuestionIcon() {
  return <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M7.9 7.5a2.2 2.2 0 1 1 3.7 1.6c-.9.7-1.6 1.1-1.6 2.4M10 14.4v.1" /></svg>;
}

function ProblemIcon() {
  return <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 5.5A2.5 2.5 0 0 1 6 3h8a2.5 2.5 0 0 1 2.5 2.5v5A2.5 2.5 0 0 1 14 13H9l-4.5 3v-3.5a2.5 2.5 0 0 1-1-2z" /><path d="M10 6.4v3.2M10 11.8v.1" /></svg>;
}

function FolderIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" /><path d="M3.5 10h17" /></svg>;
}

function DiscordIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M19.7 5.2a18.5 18.5 0 0 0-4.5-1.4l-.6 1.3a17.2 17.2 0 0 0-5.2 0l-.6-1.3a18.4 18.4 0 0 0-4.5 1.4C1.5 9.4.7 13.5 1.1 17.5a18.2 18.2 0 0 0 5.5 2.8l1.2-2a11.8 11.8 0 0 1-1.9-.9l.5-.4a13 13 0 0 0 11.2 0l.5.4a11.8 11.8 0 0 1-1.9.9l1.2 2a18.2 18.2 0 0 0 5.5-2.8c.5-4.6-.8-8.7-3.2-12.3ZM8.8 14.7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Zm6.4 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Z" /></svg>;
}

function PlusIcon() {
  return <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M10 3.5v13M3.5 10h13" /></svg>;
}

function HistoryIcon({ direction }: { direction: 'back' | 'forward' }) {
  return <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {direction === 'back' ? <path d="M8 5 3 10l5 5M3.5 10H17" /> : <path d="m12 5 5 5-5 5M16.5 10H3" />}
  </svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="10" cy="10" r="2.6" />
    <path d="m8.2 2.8.4-1h2.8l.4 1a7.8 7.8 0 0 1 1.5.6l1-.4 2 2-.4 1a7.8 7.8 0 0 1 .6 1.5l1 .4v2.8l-1 .4a7.8 7.8 0 0 1-.6 1.5l.4 1-2 2-1-.4a7.8 7.8 0 0 1-1.5.6l-.4 1h-2.8l-.4-1a7.8 7.8 0 0 1-1.5-.6l-1 .4-2-2 .4-1a7.8 7.8 0 0 1-.6-1.5l-1-.4V8.9l1-.4a7.8 7.8 0 0 1 .6-1.5l-.4-1 2-2 1 .4a7.8 7.8 0 0 1 1.5-.6Z" />
  </svg>;
}

function WindowActionIcon({ kind }: { kind: 'minimize' | 'maximize' | 'restore' | 'close' }) {
  if (kind === 'minimize') return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="M3 8h10" /></svg>;
  if (kind === 'close') return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>;
  if (kind === 'restore') return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true"><path d="M5 5V3.8c0-.4.3-.8.8-.8h6.4c.5 0 .8.4.8.8v6.4c0 .5-.3.8-.8.8H11M3 6h6.4c.4 0 .6.3.6.6V13H3z" /></svg>;
  return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx=".6" /></svg>;
}

function InternalLinkBoard({ onOpen }: { onOpen: (tab: Exclude<DesktopTab, 'companion' | 'links' | 'report'>) => void }) {
  const { t } = useDesktopLocale();
  const labels = Object.fromEntries(Object.entries(labelSource).map(([key, value]) => [key, t(value)])) as Record<DesktopTab, string>;
  const sectionDetails = Object.fromEntries(Object.entries(sectionDetailSource).map(([key, value]) => [key, t(value)])) as typeof sectionDetailSource;
  return <section className="internal-link-board" aria-labelledby="link-board-title">
    <header className="link-board-heading">
      <div><h1 id="link-board-title">{t('Модули')}</h1></div>
      <b><strong>{String(sections.length).padStart(2, '0')}</strong><span>{t('модулей')}</span></b>
    </header>
    <div className="link-board-grid">
      {sections.map((section, index) => <button className={`link-board-item link-${section}`} key={section} onClick={() => onOpen(section)}>
        <span className="link-board-copy"><small className="link-board-index">{t('МОДУЛЬ')} {String(index + 1).padStart(2, '0')}</small><strong>{labels[section]}</strong><small className="link-board-description">{sectionDetails[section]}</small></span>
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10h11M10 5l5 5-5 5" /></svg>
      </button>)}
    </div>
  </section>;
}

function ScanReportPage({ report }: { report: ScanReport | null }) {
  const { locale, t } = useDesktopLocale();
  const [query, setQuery] = React.useState('');
  const stockpiles = report?.stockpiles ?? [];
  const unavailableGroups = React.useMemo(() => {
    const groups = new Map<string, { type: string; hexes: Set<string>; count: number }>();
    for (const item of report?.incomplete ?? []) {
      const group = groups.get(item.type) ?? { type: item.type, hexes: new Set<string>(), count: 0 };
      group.hexes.add(item.hex);
      group.count += 1;
      groups.set(item.type, group);
    }
    return [...groups.values()];
  }, [report?.incomplete]);
  const itemCount = stockpiles.reduce((sum, stockpile) => sum + (Array.isArray(stockpile.items) ? stockpile.items.length : 0), 0);
  const filtered = stockpiles.map((stockpile, index) => ({ stockpile, index })).filter(({ stockpile }) => {
    const text = [stockpile.name, stockpile.type, stockpile.faction, stockpile.hex, stockpile.town,
      ...(Array.isArray(stockpile.items) ? stockpile.items.map((item) => (item as Record<string, unknown>).code) : [])].join(' ').toLocaleLowerCase();
    return text.includes(query.trim().toLocaleLowerCase());
  });
  return <section className="scan-report-page" aria-labelledby="report-page-title">
    <header className="report-page-heading"><div><h1 id="report-page-title">{t('Последнее сканирование')}</h1><p>{report ? `${report.fileName} · ${new Date(report.processedAt).toLocaleString(dateLocale[locale])}` : t('Отчёт появится после первого сканирования MapData.sav.')}</p></div></header>
    {report ? <>
      <div className="report-overview" aria-label={t('Сводка сканирования')}>
        <div><strong>{report.total}</strong><span>{t('закреплённых объектов')}</span></div>
        <div><strong>{report.stockpiles.length}</strong><span>{t('с доступными деталями')}</span></div>
        <div><strong>{report.incompleteCount}</strong><span>{t('без игровых деталей')}</span></div>
        <div><strong>{itemCount}</strong><span>{t('строк предметов')}</span></div>
      </div>
      {!!report.incompleteCount && <section className="report-incomplete" aria-labelledby="report-incomplete-title">
        <h2 id="report-incomplete-title">{t('Объекты без последних деталей')}</h2>
        <p>{report.incompleteCount} {t('закреплённых объектов')}. {t('Файл содержит их тип и сектор, но не содержимое. Причину — скрытый склад или запись из прошлой войны — определить по этим данным нельзя.')}</p>
        {!!unavailableGroups.length ? <ul>{unavailableGroups.map((group) => <li key={group.type}><span className="report-incomplete-type"><strong>{t(stockpileNames[group.type] ?? readableCode(group.type))}</strong><small>{group.type}</small></span><span>{[...group.hexes].map((hex) => hexNames[hex] ?? readableCode(hex)).join(', ')}{group.count > group.hexes.size ? ` · ${group.count} ${t('объектов')}` : ''}</span></li>)}</ul>
          : <small>{t('В старом отчёте сохранено только их число. После следующего локального сканирования здесь появятся типы объектов и секторы.')}</small>}
      </section>}
      <div className="report-stockpiles-heading"><h2>{t('Содержимое складов')}</h2><label><span>{t('Фильтр')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Склад, город, предмет…')} /></label></div>
      <div className="report-stockpiles">
        {filtered.map(({ stockpile, index }) => {
          const items = Array.isArray(stockpile.items) ? stockpile.items as Array<Record<string, unknown>> : [];
          const coords = stockpile.coords && typeof stockpile.coords === 'object' ? stockpile.coords as Record<string, unknown> : null;
          const type = fmt(stockpile.type ?? stockpile.name);
          const coordinateTitle = coords ? `${fmt(coords.x)} / ${fmt(coords.y)}` : '—';
          const coordinateValue = coords
            ? [coords.x, coords.y].map((value) => typeof value === 'number' ? value.toFixed(4) : fmt(value)).join(' / ')
            : '—';
          const timestamp = typeof stockpile.timestamp === 'string' && Number.isFinite(Date.parse(stockpile.timestamp))
            ? new Date(stockpile.timestamp).toLocaleString()
            : fmt(stockpile.timestamp);
          return <details className="report-stockpile" key={`${fmt(stockpile.hex)}-${index}`} open={index === 0 && !query}>
            <summary><span className="report-stockpile-name"><strong>{t(stockpileNames[type] ?? readableCode(type))}</strong><small>{[stockpile.town, hexNames[fmt(stockpile.hex)] ?? readableCode(fmt(stockpile.hex))].filter(Boolean).join(' · ')}</small></span><span className="report-stockpile-faction">{t(factionNames[fmt(stockpile.faction)] ?? fmt(stockpile.faction))}</span><span className="report-stockpile-items">{items.length} {t('позиций')}</span><span className="report-stockpile-caret" aria-hidden="true">⌄</span></summary>
            <div className="report-stockpile-meta"><span>{t('Тип')} <b>{t(stockpileNames[type] ?? readableCode(type))}</b></span><span>{t('Город')} <b>{fmt(stockpile.town)}</b></span><span>{t('Сектор')} <b>{hexNames[fmt(stockpile.hex)] ?? readableCode(fmt(stockpile.hex))}</b></span><span>{t('Резерв')} <b>{t(stockpile.is_reserve ? 'Да' : 'Нет')}</b></span><span title={coordinateTitle}>{t('Координаты')} <b>{coordinateValue}</b></span><span>{t('Обновлён')} <b>{timestamp}</b></span></div>
            {items.length ? <table className="report-items-table"><thead><tr><th>{t('Предмет')}</th><th>{t('Количество')}</th><th>{t('Упаковка')}</th></tr></thead><tbody>{items.map((item, itemIndex) => <tr key={`${fmt(item.code)}-${itemIndex}`}><td>{fmt(item.code)}</td><td>{fmt(item.quantity)}</td><td>{t(item.crated ? 'В ящике' : 'Штучно')}</td></tr>)}</tbody></table> : <p className="report-no-items">{t('В доступных деталях нет предметов.')}</p>}
          </details>;
        })}
        {!filtered.length && <p className="report-no-items">{t('По этому запросу ничего не найдено.')}</p>}
      </div>
    </> : <p className="report-no-items">{t('Завершите первое сканирование, чтобы получить сводку и содержимое складов.')}</p>}
  </section>;
}

function AsciiFlow({ active, scene }: { active: boolean; scene: 'companion' | 'links' | 'other' }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;
    let frame = 0;
    let lastDraw = 0;
    let width = 0;
    let height = 0;
    const cellWidth = 11;
    const cellHeight = 15;
    const glyphs = ' .,:;+=/\\|(){}[]<>01#@*';
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = motionQuery.matches;
    const shell = document.querySelector<HTMLElement>('.desktop-shell');
    let accentRgb = '244 63 82';
    const syncPalette = () => {
      const palette = getComputedStyle(shell ?? document.documentElement);
      accentRgb = palette.getPropertyValue('--accent-rgb').trim() || accentRgb;
    };
    syncPalette();
    const paletteObserver = new MutationObserver(syncPalette);
    paletteObserver.observe(shell ?? document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
    const rain: Array<{ x: number; y: number; speed: number; length: number; drift: number; seed: number }> = [];
    let rainClock = 0;
    let rainSeed = 1;
    const randomRain = () => { rainSeed = (rainSeed * 1664525 + 1013904223) >>> 0; return rainSeed / 4294967296; };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      rainSeed = Math.max(1, Math.floor(width * 1009 + height * 917 + 401));
      rain.length = 0;
      const count = Math.max(48, Math.min(240, Math.round(width / 12)));
      for (let index = 0; index < count; index += 1) rain.push({
        x: randomRain() * width,
        y: randomRain() * height,
        speed: 32 + randomRain() * 58,
        length: 4 + Math.floor(randomRain() * 5),
        drift: -5 + randomRain() * 10,
        seed: randomRain() * 22,
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const draw = (now: number) => {
      frame = 0;
      if (document.hidden) return;
      if (lastDraw && now - lastDraw < 33) {
        if (!reduceMotion) frame = requestAnimationFrame(draw);
        return;
      }
      lastDraw = now;
      context.clearRect(0, 0, width, height);
      context.font = '12px "Cascadia Mono", "JetBrains Mono", monospace';
      context.textBaseline = 'middle';
      const swing = reduceMotion ? 0 : Math.sin(now * (active ? 0.00014 : 0.0001));
      const flowPhase = reduceMotion ? 0 : now * (active ? 0.00052 : 0.00038);
      const advection = Math.sin(flowPhase) * width * 0.22;
      if (scene === 'links') {
        const elapsed = Math.min(0.06, Math.max(0, (now - rainClock) / 1000));
        rainClock = now;
        for (const streak of rain) {
          if (!reduceMotion) {
            streak.y += streak.speed * elapsed;
            streak.x += streak.drift * elapsed;
          }
          const sway = reduceMotion ? 0 : Math.sin(now * 0.0014 + streak.seed) * 2;
          const glyphPhase = reduceMotion ? 0 : Math.floor(now / 140);
          for (let tail = 0; tail < streak.length; tail += 1) {
            const y = streak.y - tail * cellHeight;
            if (y < 0 || y > height) continue;
            const fade = 1 - tail / (streak.length + 0.5);
            context.fillStyle = tail === 0
              ? `rgb(${accentRgb} / ${0.66 * fade})`
              : `rgb(${accentRgb} / ${0.34 * fade})`;
            context.fillText(glyphs[1 + Math.floor((streak.seed + tail + glyphPhase) % (glyphs.length - 1))], streak.x + sway, y);
          }
          if (!reduceMotion && streak.y - streak.length * cellHeight > height) {
            streak.y = -randomRain() * height * 0.65;
            streak.x = randomRain() * width;
          }
        }
        if (!reduceMotion) frame = requestAnimationFrame(draw);
        return;
      }
      const columns = Math.ceil(width / cellWidth);
      const rows = Math.ceil(height / cellHeight);
      const companionSourceX = width * 0.19;
      const companionSourceY = height * 0.56;
      const clockX = width * 0.19;
      const clockY = height * 0.22;
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = column * cellWidth;
          const y = row * cellHeight;
          let density = 0;
          let turbulence = 0;
          let offset = 0;
          if (scene === 'companion') {
            const along = Math.max(0, (x - companionSourceX) / Math.max(width - companionSourceX, 1));
            const clockPulse = 0.5 + 0.5 * Math.sin(now * Math.PI * 2 / 3400);
            const centerY = companionSourceY + height * (0.105 * Math.sin(along * Math.PI * 2.2 + flowPhase * 1.4 + clockPulse * 0.8)
              + 0.052 * Math.sin(along * Math.PI * 4.2 - flowPhase * 0.8));
            const thickness = height * (0.205 + 0.035 * clockPulse + 0.015 * Math.sin(along * 6 + swing));
            offset = y - centerY;
            const envelope = x >= companionSourceX ? Math.min(1, (x - companionSourceX) / (width * 0.08) + 0.25) : 0;
            const stream = Math.exp(-Math.pow(offset / thickness, 2) * 0.72) * envelope;
            const wave = (0.5 + 0.5 * Math.sin(offset / Math.max(height * 0.025, 1) - along * 15 + flowPhase * 2 + clockPulse * 2.4)) * stream;
            const wake = Math.exp(-Math.pow((x - companionSourceX) / (width * 0.12), 2) - Math.pow((y - companionSourceY) / (height * 0.12), 2));
            const clockDistance = Math.hypot((x - clockX) / (width * 0.15), (y - clockY) / (height * 0.16));
            const clockWake = Math.exp(-Math.pow((clockDistance - (0.12 + clockPulse * 0.12)) / 0.045, 2)) * clockPulse;
            turbulence = 0.5 + 0.5 * Math.sin(x * 0.008 + y * 0.006 + flowPhase * 2 + Math.sin(y * 0.008 - swing));
            density = Math.min(1, (stream * 0.4 + wave * 0.47 + wake * 0.54 + clockWake * 0.42) * (0.84 + turbulence * 0.16));
          } else {
            const along = (x + advection) / Math.max(width, 1);
            const centerY = height * (0.5 + 0.22 * Math.sin(along * Math.PI * 2.1 + swing * 1.65 + flowPhase * 0.45)
              + 0.08 * Math.sin(along * Math.PI * 4.3 - swing * 0.9 - flowPhase * 0.3));
            const thickness = height * (0.235 + 0.035 * Math.sin(along * 7 + swing));
            offset = y - centerY;
            const vortexX = width * (0.5 + swing * 0.39);
            const vortexY = height * (0.5 - swing * 0.18);
            const dx = (x - vortexX) / Math.max(width, 1);
            const dy = (y - vortexY) / Math.max(height, 1);
            const radius = Math.hypot(dx, dy * 0.92);
            const angle = Math.atan2(dy, dx);
            const curl = (0.5 + 0.5 * Math.sin(radius * 42 - angle * 2.2 + swing * 2.8 + flowPhase * 1.6)) * Math.exp(-radius * 1.55);
            turbulence = 0.5 + 0.5 * Math.sin(x * 0.008 + y * 0.006 + flowPhase * 3.2 + Math.sin(y * 0.009 - swing * 2));
            density = Math.min(1, (Math.exp(-Math.pow(offset / thickness, 2) * 0.8) * 0.78 + curl * 0.42) * (0.82 + turbulence * 0.18));
          }
          if (density < 0.025) continue;
          const index = Math.max(1, Math.min(glyphs.length - 1, Math.floor((density * 10 + turbulence * 7 + Math.abs(offset) / cellHeight) % glyphs.length)));
          const alpha = Math.min(scene === 'companion' ? 0.43 : 0.49, 0.028 + density * (scene === 'companion' ? 0.39 : 0.44));
          context.fillStyle = `rgb(${accentRgb} / ${alpha})`;
          context.fillText(glyphs[index], x, y);
          context.globalAlpha = 1;
        }
      }
      if (!reduceMotion) frame = requestAnimationFrame(draw);
    };
    const syncMotion = () => {
      reduceMotion = motionQuery.matches;
      cancelAnimationFrame(frame);
      frame = 0;
      if (reduceMotion) draw(performance.now());
      else if (!document.hidden) frame = requestAnimationFrame(draw);
    };
    const syncVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (reduceMotion) draw(performance.now());
      else if (!frame) frame = requestAnimationFrame(draw);
    };
    motionQuery.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    if (reduceMotion) draw(performance.now());
    else frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      paletteObserver.disconnect();
      motionQuery.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, [active, scene]);
  return <canvas ref={canvasRef} className="ascii-flow" aria-hidden="true" />;
}

export default function DesktopShell() {
  const { locale, t } = useDesktopLocale();
  const labels = Object.fromEntries(Object.entries(labelSource).map(([key, value]) => [key, t(value)])) as Record<DesktopTab, string>;
  const statusNames = Object.fromEntries(Object.entries(statusNameSource).map(([key, value]) => [key, t(value)])) as Record<ScanStatus['state'], string>;
  const [openTabs, setOpenTabs] = React.useState<DesktopTab[]>(['companion']);
  const [active, setActive] = React.useState<DesktopTab>('companion');
  const tabHistory = React.useRef<DesktopTab[]>(['companion']);
  const historyCursor = React.useRef(0);
  const [historyPosition, setHistoryPosition] = React.useState(0);
  const [frameHistory, setFrameHistory] = React.useState({ canBack: false, canForward: false });
  const [status, setStatus] = React.useState<ScanStatus>({ state: 'waiting', folder: null, fileName: null, message: 'Ищу MapData.sav в папке сохранений Foxhole.' });
  const [continuousScanning, setContinuousScanning] = React.useState(true);
  const [scanToggleBusy, setScanToggleBusy] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [authQuery, setAuthQuery] = React.useState('');
  const [windowMaximized, setWindowMaximized] = React.useState(false);
  const [profile, setProfile] = React.useState<CompanionProfile | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(true);
  const [profileUnavailable, setProfileUnavailable] = React.useState(false);
  const [lastReport, setLastReport] = React.useState<ScanReport | null>(null);
  const [serverSetup, setServerSetup] = React.useState<DiscordSetup | null>(null);
  const [serverSetupOpen, setServerSetupOpen] = React.useState(false);
  const [serverSetupLoading, setServerSetupLoading] = React.useState(false);
  const [serverSetupBusy, setServerSetupBusy] = React.useState(false);
  const [serverSetupError, setServerSetupError] = React.useState('');
  const [problemPanelOpen, setProblemPanelOpen] = React.useState(false);
  const [diagnosticsExportStatus, setDiagnosticsExportStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [updateState, setUpdateState] = React.useState<UpdateState>({ status: 'idle' });
  const [updateDismissedVersion, setUpdateDismissedVersion] = React.useState<string | null>(null);

  const refreshFrameHistory = React.useCallback((tab: DesktopTab) => {
    window.requestAnimationFrame(() => {
      const frame = [...document.querySelectorAll<HTMLIFrameElement>('.desktop-section-frame')]
        .find((item) => item.style.display !== 'none' && item.title === labels[tab]);
      const state = frame?.contentWindow?.history.state as { __chronomancerIndex?: number } | null | undefined;
      const index = Number(state?.__chronomancerIndex ?? 0);
      const length = frame?.contentWindow?.history.length ?? 1;
      setFrameHistory({ canBack: index > 0, canForward: index < length - 1 });
    });
  }, []);
  const navigateTab = React.useCallback((tab: DesktopTab) => {
    if (tabHistory.current[historyCursor.current] === tab) return;
    setActive(tab);
    setFrameHistory({ canBack: false, canForward: false });
    const next = tabHistory.current.slice(0, historyCursor.current + 1);
    next.push(tab);
    tabHistory.current = next;
    historyCursor.current = next.length - 1;
    setHistoryPosition(historyCursor.current);
    refreshFrameHistory(tab);
  }, [refreshFrameHistory]);
  const moveTabHistory = React.useCallback((direction: -1 | 1) => {
    const nextPosition = historyCursor.current + direction;
    if (nextPosition < 0 || nextPosition >= tabHistory.current.length) return;
    historyCursor.current = nextPosition;
    setHistoryPosition(nextPosition);
    const tab = tabHistory.current[nextPosition];
    setActive(tab);
    setFrameHistory({ canBack: false, canForward: false });
    refreshFrameHistory(tab);
  }, [refreshFrameHistory]);
  const navigateHistory = React.useCallback((direction: -1 | 1) => {
    const frame = [...document.querySelectorAll<HTMLIFrameElement>('.desktop-section-frame')].find((item) => item.style.display !== 'none');
    try {
      const frameWindow = frame?.contentWindow;
      const index = Number((frameWindow?.history.state as { __chronomancerIndex?: number } | null)?.__chronomancerIndex ?? 0);
      const canMove = direction < 0 ? index > 0 : index < (frameWindow?.history.length ?? 1) - 1;
      if (frameWindow && canMove) {
        frameWindow.history[direction < 0 ? 'back' : 'forward']();
        return;
      }
    } catch { /* cross-origin frames fall back to tab history */ }
    moveTabHistory(direction);
  }, [moveTabHistory]);

  React.useEffect(() => {
    const api = getApi();
    if (!api) return;
    void api.getUpdateState().then((state) => { if (state) setUpdateState(state); }).catch(() => {});
    return api.onUpdateState(setUpdateState);
  }, []);

  React.useEffect(() => {
    const onAuxClick = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      navigateHistory(event.button === 3 ? -1 : 1);
    };
    const onFrameMessage = (event: MessageEvent) => {
      const frames = [...document.querySelectorAll<HTMLIFrameElement>('.desktop-section-frame')];
      const sourceFrame = frames.find((item) => event.source === item.contentWindow);
      if (!sourceFrame) return;
      const frame = frames.find((item) => item.style.display !== 'none');
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; canBack?: boolean; canForward?: boolean; direction?: string; theme?: string; requestId?: string };
      if (data?.type === 'chronomancer:theme-change') {
        const candidate = data.theme === 'dark' ? 'red' : data.theme;
        if (typeof candidate === 'string' && ['red', 'lime', 'light', 'amber', 'contrast', 'noir', 'soft', 'ascii'].includes(candidate)) {
          document.querySelector('.desktop-shell')?.setAttribute('data-skin', candidate);
        }
      } else if (sourceFrame === frame && data?.type === 'chronomancer:history-state') {
        setFrameHistory({ canBack: Boolean(data.canBack), canForward: Boolean(data.canForward) });
      } else if (sourceFrame === frame && data?.type === 'chronomancer:history-fallback') {
        moveTabHistory(data.direction === 'forward' ? 1 : -1);
      } else if (data?.type === 'chronomancer:open-local-report') {
        setOpenTabs((tabs) => tabs.includes('report') ? tabs : [...tabs, 'report']);
        navigateTab('report');
      } else if (sourceFrame === frame && data?.type === 'chronomancer:get-local-scan' && typeof data.requestId === 'string' && data.requestId.length <= 64) {
        sourceFrame.contentWindow?.postMessage({
          type: 'chronomancer:local-scan-result',
          requestId: data.requestId,
          report: ['ready', 'partial'].includes(status.state) && status.processedAt && status.stockpiles?.length
            ? { processedAt: status.processedAt, fileName: status.fileName, stockpiles: status.stockpiles }
            : null,
          state: status.state,
        }, event.origin);
      }
    };
    document.addEventListener('auxclick', onAuxClick);
    window.addEventListener('message', onFrameMessage);
    return () => {
      document.removeEventListener('auxclick', onAuxClick);
      window.removeEventListener('message', onFrameMessage);
    };
  }, [moveTabHistory, navigateHistory, navigateTab, status]);

  React.useEffect(() => {
    type DesktopSkin = 'red' | 'lime' | 'light' | 'amber' | 'contrast' | 'noir' | 'soft' | 'ascii';
    const isSkin = (candidate: string): candidate is DesktopSkin => ['red', 'lime', 'light', 'amber', 'contrast', 'noir', 'soft', 'ascii'].includes(candidate);
    const syncTheme = (value?: string | null) => {
      let stored = value;
      try {
        if (window.localStorage.getItem(STORAGE_KEYS.themeDefaultMigration) !== 'red-v1') {
          window.localStorage.setItem(STORAGE_KEYS.theme, 'red');
          window.localStorage.setItem(STORAGE_KEYS.themeDefaultMigration, 'red-v1');
          stored = 'red';
        } else if (stored === null || stored === undefined) {
          stored = window.localStorage.getItem(STORAGE_KEYS.theme);
        }
      } catch {
        stored = null;
      }
      const theme: DesktopSkin = stored === 'dark' ? 'red' : stored && isSkin(stored) ? stored : 'red';
      document.querySelector('.desktop-shell')?.setAttribute('data-skin', theme);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.theme || event.key === null) syncTheme(event.newValue);
    };
    syncTheme();
    window.addEventListener('storage', onStorage);
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('chronomancer-theme');
    if (channel) channel.onmessage = (event: MessageEvent<string>) => syncTheme(event.data);
    const onThemeMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; theme?: string };
      if (data?.type === 'chronomancer:theme-change') syncTheme(data.theme);
    };
    window.addEventListener('message', onThemeMessage);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('message', onThemeMessage); channel?.close(); };
  }, []);

  const refreshProfile = React.useCallback(() => {
    const api = getApi();
    if (!api) { setProfileLoading(false); return; }
    void api.getCompanionProfile().then((next) => {
      setProfileLoading(false);
      if (next === undefined) { setProfileUnavailable(true); return; }
      setProfileUnavailable(false);
      setProfile(next);
    }).catch(() => { setProfileLoading(false); setProfileUnavailable(true); });
  }, []);

  const loadServerSetup = React.useCallback(async () => {
    const api = getApi();
    if (!api) return;
    setServerSetupOpen(true);
    setServerSetupLoading(true);
    setServerSetupError('');
    const next = await api.getDiscordSetup().catch(() => null);
    setServerSetup(next);
    setServerSetupLoading(false);
    if (!next) setServerSetupError('Список Discord-серверов не получен. Повторите вход через Discord.');
  }, []);

  const chooseDiscordContext = async (choice: DiscordChoice) => {
    const api = getApi();
    if (!api) return;
    setServerSetupBusy(true);
    setServerSetupError('');
    const result = await api.completeDiscordSetup(choice).catch(() => ({ ok: false, error: 'Не удалось применить выбор.' }));
    setServerSetupBusy(false);
    if (!result.ok) { setServerSetupError(result.error ?? 'Не удалось применить выбор.'); return; }
    setServerSetupOpen(false);
    setServerSetup(null);
    setProfile(null);
    setProfileLoading(true);
    setProfileUnavailable(false);
    refreshProfile();
  };

  React.useEffect(() => {
    const api = getApi();
    if (!api) { refreshProfile(); return; }
    api.getCompanionStatus().then((next) => { if (next?.state) { setStatus(next); setContinuousScanning(next.state !== 'paused'); } }).catch(() => {});
    api.getLastScanReport().then(setLastReport).catch(() => {});
    refreshProfile();
    const profileTimer = window.setInterval(refreshProfile, 20000);
    const unlisten = api.onCompanionStatus((next) => {
      if (next?.state) { setStatus(next); setContinuousScanning(next.state !== 'paused'); }
      if (next?.processedAt) void api.getLastScanReport().then(setLastReport).catch(() => {});
    });
    return () => { window.clearInterval(profileTimer); unlisten(); };
  }, [refreshProfile]);

  React.useEffect(() => {
    const api = getApi();
    if (!api) return;
    void api.isWindowMaximized().then(setWindowMaximized).catch(() => {});
    return api.onWindowMaximized(setWindowMaximized);
  }, []);

  React.useEffect(() => {
    const api = getApi();
    if (!api) return;
    return api.onAuthComplete((state) => {
      const choosingServer = state.setup === 'guild';
      const next: DesktopTab = choosingServer ? 'companion' : openTabs.includes('tools') ? 'tools' : 'companion';
      setOpenTabs((tabs) => tabs.includes(next) ? tabs : [...tabs, next]);
      navigateTab(next);
      const query = new URLSearchParams();
      if (state.error) query.set('error', state.error);
      setAuthQuery(query.toString());
      setReloadKey((n) => n + 1);
      if (choosingServer) void loadServerSetup();
      else refreshProfile();
    });
  }, [openTabs, refreshProfile, loadServerSetup, navigateTab]);

  const openSection = (tab: Exclude<DesktopTab, 'companion' | 'report'>) => {
    setOpenTabs((tabs) => tabs.includes(tab) ? tabs : [...tabs, tab]);
    navigateTab(tab);
  };
  const openReport = () => {
    setOpenTabs((tabs) => tabs.includes('report') ? tabs : [...tabs, 'report']);
    navigateTab('report');
  };
  const closeTab = (tab: DesktopTab) => {
    if (tab === 'companion') return;
    const next = openTabs.filter((item) => item !== tab);
    setOpenTabs(next);
    const pruned = tabHistory.current.filter((item) => item === 'companion' || next.includes(item)).filter((item, index, list) => item !== list[index - 1]);
    tabHistory.current = pruned.length ? pruned : ['companion'];
    const currentPosition = tabHistory.current.lastIndexOf(active === tab ? (tabHistory.current.at(-1) ?? 'companion') : active);
    historyCursor.current = currentPosition >= 0 ? currentPosition : tabHistory.current.length - 1;
    setHistoryPosition(historyCursor.current);
    if (active === tab) {
      const target = tabHistory.current[historyCursor.current] ?? next[Math.max(0, openTabs.indexOf(tab) - 1)] ?? 'companion';
      setActive(target);
      setFrameHistory({ canBack: false, canForward: false });
      refreshFrameHistory(target);
    }
  };
  const chooseFile = async () => { const api = getApi(); if (api) { const next = await api.chooseSaveFile(); if (next?.state) setStatus(next); } };
  const login = async () => { await getApi()?.openDiscordLogin(); };
  const openSettings = () => openSection('cabinet');
  const exportDiagnostics = async () => {
    const api = getApi();
    if (!api || diagnosticsExportStatus === 'saving') return;
    setDiagnosticsExportStatus('saving');
    try {
      const result = await api.exportDiagnostics();
      setDiagnosticsExportStatus(result?.ok ? 'saved' : result?.canceled ? 'idle' : 'error');
    } catch { setDiagnosticsExportStatus('error'); }
  };
  const downloadUpdate = async () => { await getApi()?.downloadUpdate(); };
  const installUpdate = async () => { await getApi()?.installUpdate(); };
  const toggleContinuousScanning = async () => {
    const api = getApi();
    if (!api || scanToggleBusy) return;
    setScanToggleBusy(true);
    try {
      const next = await api.setContinuousScanning(!continuousScanning);
      if (next?.state) { setStatus(next); setContinuousScanning(next.state !== 'paused'); }
    } finally { setScanToggleBusy(false); }
  };
  const totalStockpiles = (status.stockpiles?.length ?? 0) + (status.incompleteCount ?? 0);

  return <main className="desktop-shell">
    <AsciiFlow active={status.state === 'processing'} scene={active === 'companion' ? 'companion' : active === 'links' ? 'links' : 'other'} />
    <header className="desktop-topbar">
      <div className="desktop-brand"><span className="desktop-mark" title="Chronum"><img src="/chronomancer-icon.png" width={44} height={44} alt="" /></span><span>Chronum</span><i>FOXHOLE LOGI</i><small className="desktop-version">v{process.env.NEXT_PUBLIC_CHRONUM_VERSION}</small></div>
      <div className="desktop-topbar-actions">
        {status.state !== 'waiting' && <div className="desktop-live" role="status" aria-label={status.state === 'processing' ? 'Локальное сканирование' : statusNames[status.state]} title={status.state === 'processing' ? 'Локальное сканирование' : statusNames[status.state]}><b className={status.state === 'error' ? 'is-error' : status.state === 'processing' ? 'is-working' : ''} /></div>}
        <div className="desktop-problem-menu">
          <button type="button" className="desktop-problem-trigger" onClick={() => { setProblemPanelOpen((open) => !open); setDiagnosticsExportStatus('idle'); }} aria-label={t('Сообщить о проблеме')} aria-expanded={problemPanelOpen} aria-controls="desktop-problem-panel"><ProblemIcon /><span>{t('Сообщить о проблеме')}</span></button>
          {problemPanelOpen && <section className="desktop-problem-panel" id="desktop-problem-panel" aria-labelledby="desktop-problem-title">
            <div className="desktop-problem-heading"><h2 id="desktop-problem-title">{t('Сообщить о проблеме')}</h2><button type="button" onClick={() => setProblemPanelOpen(false)} aria-label={t('Закрыть')}>×</button></div>
            <p>{t('Архив поможет разобраться с ошибкой. Скачайте его и отправьте разработчику.')}</p>
            <p className="desktop-problem-privacy">{t('Архив не содержит сохранение Foxhole и данные входа.')}</p>
            <button type="button" className="desktop-problem-download" onClick={() => void exportDiagnostics()} disabled={diagnosticsExportStatus === 'saving'}>
              {diagnosticsExportStatus === 'saving' ? t('Подготовка архива…') : t('Скачать файл диагностики')}
            </button>
            {diagnosticsExportStatus === 'saved' && <p className="desktop-problem-result is-success" role="status">{t('Диагностический файл сохранён.')}</p>}
            {diagnosticsExportStatus === 'error' && <p className="desktop-problem-result is-error" role="alert">{t('Не удалось сохранить архив.')}</p>}
          </section>}
        </div>
        <button type="button" className="desktop-global-settings" onClick={openSettings} aria-label={t('Настройки')} title={t('Настройки')}><SettingsIcon /></button>
        <div className="desktop-window-controls" aria-label={t('Управление окном')}>
          <button type="button" onClick={() => void getApi()?.minimizeWindow()} aria-label={t('Свернуть окно')} title={t('Свернуть')}><WindowActionIcon kind="minimize" /></button>
          <button type="button" onClick={() => void getApi()?.toggleMaximizeWindow().then(setWindowMaximized)} aria-label={t(windowMaximized ? 'Восстановить окно' : 'Развернуть окно')} title={t(windowMaximized ? 'Восстановить' : 'Развернуть')}><WindowActionIcon kind={windowMaximized ? 'restore' : 'maximize'} /></button>
          <button type="button" className="window-close" onClick={() => void getApi()?.closeWindow()} aria-label={t('Скрыть Chronum в трей')} title={t('Скрыть в трей')}><WindowActionIcon kind="close" /></button>
        </div>
      </div>
    </header>

    {updateState.availableVersion && ['available', 'downloading', 'downloaded'].includes(updateState.status) && updateDismissedVersion !== updateState.availableVersion && <div className="desktop-update-scrim">
      <section className="desktop-update-dialog" role="dialog" aria-modal="true" aria-labelledby="desktop-update-title">
        <h2 id="desktop-update-title">{t('Доступна версия {version}', { version: updateState.availableVersion })}</h2>
        <p>{t('При запуске приложение проверяет обновления, но не скачивает их без вашего согласия.')}</p>
        {updateState.status === 'downloading' && <div className="desktop-update-progress"><progress max={100} value={updateState.percent ?? 0} /><span>{t('Скачивание: {percent}%', { percent: updateState.percent ?? 0 })}</span></div>}
        {updateState.status === 'downloaded' && <p>{t('Обновление готово к установке.')}</p>}
        <div className="desktop-update-actions">
          {updateState.status === 'available' && <button type="button" className="desktop-update-primary" onClick={() => void downloadUpdate()}>{t('Скачать обновление')}</button>}
          {updateState.status === 'downloaded' && <button type="button" className="desktop-update-primary" onClick={() => void installUpdate()}>{t('Обновить и перезапустить')}</button>}
          {updateState.status !== 'downloading' && <button type="button" className="desktop-update-secondary" onClick={() => setUpdateDismissedVersion(updateState.availableVersion ?? null)}>{t('Позже')}</button>}
        </div>
      </section>
    </div>}

    <nav className="desktop-tabs" aria-label={t('Вкладки Chronum')}>
      <div className="desktop-history-controls" aria-label={t('История переходов')}>
        <button type="button" onClick={() => navigateHistory(-1)} disabled={!frameHistory.canBack && historyPosition === 0} aria-label={t('Назад')} title={t('Назад')}><HistoryIcon direction="back" /></button>
        <button type="button" onClick={() => navigateHistory(1)} disabled={!frameHistory.canForward && historyPosition >= tabHistory.current.length - 1} aria-label={t('Вперёд')} title={t('Вперёд')}><HistoryIcon direction="forward" /></button>
      </div>
      <div className="desktop-tab-item">
        <button type="button" className={`desktop-tab ${active === 'companion' ? 'is-active' : ''}`} onClick={() => navigateTab('companion')} aria-current={active === 'companion' ? 'page' : undefined}>
          <span>{labels.companion}</span>
        </button>
        <button type="button" className="desktop-add-tab" onClick={() => openSection('links')} aria-label={t('Добавить вкладку: открыть разделы Chronum')} title={t('Открыть все разделы')}><PlusIcon /></button>
      </div>
      {openTabs.filter((tab) => tab !== 'companion').map((tab) => <div key={tab} className="desktop-tab-item">
        <button type="button" className={`desktop-tab ${active === tab ? 'is-active' : ''}`} onClick={() => navigateTab(tab)} aria-current={active === tab ? 'page' : undefined}>
          <span>{labels[tab]}</span>
        </button>
        <button type="button" className="desktop-tab-close" onClick={() => closeTab(tab)} aria-label={`${t('Закрыть')}: ${labels[tab]}`} title={`${t('Закрыть')} ${labels[tab]}`}>×</button>
      </div>)}
    </nav>

    <section className="desktop-content">
      {openTabs.map((tab) => {
        if (tab === 'links') return <div key={tab} className="native-page link-board-page" style={{ display: active === tab ? 'block' : 'none' }}><InternalLinkBoard onOpen={openSection} /></div>;
        if (tab === 'report') return <div key={tab} className="native-page" style={{ display: active === tab ? 'block' : 'none' }}><ScanReportPage report={lastReport} /></div>;
        if (tab !== 'companion') return <iframe key={`${tab}-${reloadKey}`} className="desktop-section-frame" title={labels[tab]} src={`app://sindaris/section.html?tab=${tab}${tab === 'tools' && authQuery ? `&${authQuery}` : ''}`} style={{ display: active === tab ? 'block' : 'none' }} />;
        return <div key={tab} className="companion-page" style={{ display: active === tab ? 'block' : 'none' }}>
        <div className={`companion-desktop${status.state === 'processing' ? ' is-scanning' : ''}`}>
          <aside className="guardian-rail" aria-label={t('Маскот локального сканера')}>
            <button type="button" className={`continuous-scan-toggle${continuousScanning ? ' is-on' : ''}`} role="switch" aria-checked={continuousScanning} aria-busy={scanToggleBusy} disabled={scanToggleBusy} onClick={() => void toggleContinuousScanning()}><span>{t('Постоянное сканирование')}</span><i aria-hidden="true" /></button>
            <picture className="guardian-picture"><source media="(max-width: 1080px), (max-height: 720px)" srcSet="/chronomancer-mascot-medium.png" /><img className="guardian-portrait" src="/chronomancer-mascot.png" width={1070} height={1536} alt={t('Маскот Chronum')} /></picture>
          </aside>
          <div className="companion-workspace">
            <div className="companion-page-inner">
          <header className="companion-hero">
            <div>
              <h1>{t('Склады под контролем.')}</h1>
              <p>{t('Сканер читает сохранение прямо на этом компьютере.')}</p>
            </div>
          </header>

          <div className="companion-layout">
            <section className={`scan-panel scan-${status.state}`} aria-labelledby="save-file-title">
              <div className="scan-panel-heading">
                <div className="scan-panel-title"><span className="scan-panel-icon"><FolderIcon /></span><h2 id="save-file-title">{t('Файл сохранения')}</h2>
                  <details className="save-help">
                    <summary aria-label={t('Где найти MapData.sav')} title={t('Где найти файл')}><QuestionIcon /></summary>
                    <div className="save-help-popover"><strong>{t('Где найти MapData.sav')}</strong><p>{t('Обычно Foxhole сохраняет файл здесь:')}</p><code>%LOCALAPPDATA%\Foxhole\Saved\SaveGames</code><p>{t('Найдите файл с именем, оканчивающимся на _MapData.sav, и выберите его. Компаньон будет перечитывать его при обновлении.')}</p></div>
                  </details>
                </div>
                <span className="scan-state"><i />{statusNames[status.state]}</span>
              </div>

              <div className="scan-file-row">
                <span className="scan-file-mark"><FolderIcon /></span>
                <div className="scan-file-copy"><strong>{status.fileName ?? (status.state === 'error' ? t('Файл не найден') : t('Идёт поиск MapData.sav…'))}</strong><span>{status.folder ?? '%LOCALAPPDATA%/Foxhole/Saved/SaveGames'}</span></div>
                <button className="button-primary" onClick={chooseFile}>{status.fileName ? t('Сменить файл') : t('Найти файл')}</button>
              </div>

              <div className="scan-feedback" role="status" aria-live="polite">
                <span className="scan-feedback-light" />
                <div><strong>{statusNames[status.state]}</strong><p>{localizedScanMessage(status, t)}</p></div>
              </div>
              {status.sync && <p className={`scan-sync-status is-${status.sync.state}`} role="status">{status.sync.message}</p>}
            </section>

            <section className="account-panel" aria-labelledby="account-title">
              {serverSetupOpen ? <>
                <div className="account-copy"><h2 id="account-title">{t('Выберите сервер Discord')}</h2><p>{t('Укажите клан для сайта и синхронизации именованных складов из игрового сохранения.')}</p></div>
                {serverSetupLoading ? <p className="server-setup-status" role="status">{t('Получаю список доступных серверов…')}</p> : serverSetup ? <div className="server-picker-list">
                  {!!serverSetup.joins.length && <div className="server-picker-group"><strong>{t('Кланы, в которые можно вступить')}</strong>
                    {serverSetup.joins.map((join) => <button className="server-choice" key={`join-${join.clanId}`} disabled={serverSetupBusy} onClick={() => void chooseDiscordContext({ joinClanId: join.clanId })}>
                      {join.iconUrl ? <img src={join.iconUrl} alt="" width={36} height={36} loading="lazy" /> : <span className="server-choice-mark">{join.name.slice(0, 1).toUpperCase()}</span>}
                      <span className="server-choice-copy"><b>{join.name}</b><small>{t('Вступить')} · {t(({ basic: 'базовый', medium: 'средний', high: 'высокий' } as Record<string, string>)[join.level] ?? 'базовый')} {t('уровень')}{join.roles.length ? ` · ${join.roles.slice(0, 2).join(', ')}` : ''}</small></span><span className="server-choice-arrow">›</span>
                    </button>)}
                  </div>}
                  {!!serverSetup.guilds.length && <div className="server-picker-group"><strong>{t('Ваши Discord-серверы')}</strong>
                    {serverSetup.guilds.map((guild) => <button className="server-choice" key={`guild-${guild.id}`} disabled={serverSetupBusy} onClick={() => void chooseDiscordContext({ guildId: guild.id })}>
                      {guild.iconUrl ? <img src={guild.iconUrl} alt="" width={36} height={36} loading="lazy" /> : <span className="server-choice-mark">{guild.name.slice(0, 1).toUpperCase()}</span>}
                      <span className="server-choice-copy"><b>{guild.name}</b><small>{guild.clanId ? t('Клан · {name}', { name: guild.clanName || guild.clanId }) : t('Создать клан на этом сервере')}</small></span><span className="server-choice-arrow">›</span>
                    </button>)}
                  </div>}
                  {!!serverSetup.memberships.length && <div className="server-picker-group"><strong>{t('Мои кланы')}</strong>
                    {serverSetup.memberships.map((membership) => <button className="server-choice" key={`membership-${membership.clanId}`} disabled={serverSetupBusy} onClick={() => void chooseDiscordContext({ clanId: membership.clanId })}>
                      <span className="server-choice-mark">{membership.clanName.slice(0, 1).toUpperCase()}</span><span className="server-choice-copy"><b>{membership.clanName}</b><small>{t('Войти')} · {t(membership.role)}</small></span><span className="server-choice-arrow">›</span>
                    </button>)}
                  </div>}
                  {!serverSetup.joins.length && !serverSetup.guilds.length && !serverSetup.memberships.length && <p className="server-setup-status">{t('Для аккаунта пока не найдено доступных кланов.')}</p>}
                </div> : null}
                {serverSetupError && <p className="server-setup-error" role="alert">{t(serverSetupError) !== serverSetupError ? t(serverSetupError) : t('Не удалось выполнить действие. Попробуйте снова.')}</p>}
                <button className="server-setup-cancel" onClick={() => { setServerSetupOpen(false); setServerSetupError(''); }}>{t('Назад к компаньону')}</button>
              </> : profile ? <>
                <div className="account-copy"><h2 id="account-title">{t('Профиль Chronum')}</h2><p>{profile.clanId ? t('Активный сервер: {name}.', { name: profile.clanName || profile.clanId }) : t('Вход выполнен.')} {status.sync ? localizedSyncMessage(status.sync, t) : t('Скан будет синхронизирован после обработки и проверки прав доступа.')}</p></div>
                <div className="companion-profile">
                  {profile.avatarUrl ? <img className="companion-avatar" src={profile.avatarUrl} alt={`Аватар ${profile.displayName}`} width={43} height={43} /> : <span className="companion-avatar companion-avatar-fallback">{profile.displayName.slice(0, 1).toUpperCase()}</span>}
                  <div className="companion-profile-copy"><strong>{profile.displayName}</strong></div>
                  <span className={`level-badge level-${profile.level}`} title={t('Уровень доступа на сайте')}>
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2 6 3.5v7L10 18l-6-5.5v-7z"/><path d="m7 10 2 2 4-4"/></svg>
                    {t(({ owner: 'Командир', high: 'Высокий', medium: 'Средний', basic: 'Базовый', custom: 'Особый', guest: 'Гость' } as const)[profile.level])}
                  </span>
                </div>
                {profile.clanId && <div className="server-context"><span className="server-context-icon">{profile.clanAvatarUrl ? <img src={profile.clanAvatarUrl} alt="" width={29} height={29} /> : profile.clanName.slice(0, 1).toUpperCase()}</span><div><strong>{profile.clanName || profile.clanId}</strong></div></div>}
                <button className="profile-server-change" onClick={login}>{t('Выбрать сервер Discord')}</button>
              </> : profileLoading ? <div className="account-copy"><h2 id="account-title">{t('Проверяю аккаунт')}</h2><p>{t('Сверяю текущий вход Chronum.')}</p></div>
                : profileUnavailable ? <div className="account-copy"><h2 id="account-title">{t('Нет связи с сайтом')}</h2><p>{t('Статус входа пока не удалось проверить.')}</p><button className="profile-retry" onClick={refreshProfile}>{t('Проверить снова')}</button></div>
                : <>
                <div className="account-copy"><h2 id="account-title">{t('Ваш клан — в соседней вкладке')}</h2><p>{t('Подключите аккаунт, чтобы открыть инструменты Chronum и данные клана.')}</p></div>
                <button className="button-discord" onClick={login}><DiscordIcon />{t('Войти через Discord')}</button>
              </>}
            </section>

            <section className="scan-results" aria-labelledby="scan-results-title">
              <div className="scan-results-heading"><h2 id="scan-results-title">{t('Последнее сканирование')}</h2><span>{status.processedAt ? new Date(status.processedAt).toLocaleTimeString(dateLocale[locale]) : t('Ожидание данных')}</span>
                <button className="report-button" onClick={openReport}>{t('Посмотреть последний отчёт')}</button>
              </div>
              {status.processedAt ? <div className="scan-results-count"><strong>{totalStockpiles}</strong><span>{t('закреплённых объектов')}</span><i />
                <div><b>{status.stockpiles?.length ?? 0}</b><span>{t('с доступными деталями')}</span></div>
                {!!status.incompleteCount && <div className="scan-incomplete"><b>{status.incompleteCount}</b><span>{t('без игровых деталей')}</span></div>}
              </div> : <p className="scan-empty">{status.state === 'processing' ? t('Жду окончания локального сканирования.') : t('Результаты появятся после первого сканирования MapData.sav.')}</p>}
              {(status.stockpiles?.length ?? 0) > 0 && <div className="stockpile-list">{status.stockpiles!.map((stockpile, index) => <div className="stockpile-row" key={`${fmt(stockpile.name)}-${index}`}><b>{fmt(stockpile.name ?? stockpile.type)}</b><span>{fmt(stockpile.hex)}</span><span>{Array.isArray(stockpile.items) ? `${stockpile.items.length} ${t('поз.')}` : t('Детали доступны')}</span></div>)}</div>}
              {!!status.incompleteCount && <p className="scan-incomplete-note">{t('Эти объекты не считаются пустыми: игра не предоставила их последние детали.')}</p>}
            </section>
          </div>
        </div>
          </div>
        </div>
      </div>;
      })}
    </section>
  </main>;
}
