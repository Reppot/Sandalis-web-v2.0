import * as React from 'react';
import { STORAGE_KEYS } from '@/shared/lib/storage';
import './desktop.css';

type DesktopTab = 'companion' | 'links' | 'report' | 'tools' | 'clan' | 'guide' | 'feedback' | 'mail' | 'support' | 'cabinet';
type ScanStatus = {
  state: 'waiting' | 'processing' | 'ready' | 'partial' | 'error';
  folder: string | null;
  fileName: string | null;
  message: string;
  stockpiles?: Array<Record<string, unknown>>;
  incomplete?: Array<{ type: string; hex: string }>;
  incompleteCount?: number;
  processedAt?: string | null;
};
type CompanionProfile = { displayName: string; avatarUrl: string | null; clanId: string; clanName: string; clanAvatarUrl: string | null; level: 'owner' | 'high' | 'medium' | 'basic' | 'custom' | 'guest' };
type ScanReport = { processedAt: string; fileName: string; stockpiles: Array<Record<string, unknown>>; incomplete?: Array<{ type: string; hex: string }>; incompleteCount: number; total: number };
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
  getCompanionProfile: () => Promise<CompanionProfile | null | undefined>;
  getLastScanReport: () => Promise<ScanReport | null>;
  getDiscordSetup: () => Promise<DiscordSetup | null>;
  completeDiscordSetup: (selection: DiscordChoice) => Promise<{ ok: boolean; error?: string }>;
  openDiscordLogin: () => Promise<boolean>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onWindowMaximized: (callback: (maximized: boolean) => void) => () => void;
  onCompanionStatus: (callback: (status: ScanStatus) => void) => () => void;
  onAuthComplete: (callback: (state: Record<string, string>) => void) => () => void;
};

const getApi = () => typeof window === 'undefined' ? undefined : (window as Window & { chronomancerDesktop?: DesktopApi }).chronomancerDesktop;
const labels: Record<DesktopTab, string> = {
  companion: 'Компаньон', links: 'Разделы Chronomancer', report: 'Последний отчёт', tools: 'Инструменты', clan: 'Клан', guide: 'Руководство',
  feedback: 'Обратная связь', mail: 'Почта', support: 'Поддержка', cabinet: 'Настройки',
};
const sections = Object.keys(labels).filter((key) => !['companion', 'links', 'report'].includes(key)) as Exclude<DesktopTab, 'companion' | 'links' | 'report'>[];
const sectionDetails: Record<Exclude<DesktopTab, 'companion' | 'links' | 'report'>, string> = {
  tools: 'Производственные калькуляторы и рабочие инструменты.', clan: 'Склады, заказы и состояние клана.',
  guide: 'Обучение и справочные материалы Chronomancer.', feedback: 'Обратная связь команде проекта.',
  mail: 'Уведомления и сообщения аккаунта.', support: 'Помощь и контакты поддержки.', cabinet: 'Профиль и параметры аккаунта.',
};
const statusNames: Record<ScanStatus['state'], string> = {
  waiting: 'Поиск файла', processing: 'Сканирование', ready: 'Готово', partial: 'Есть недоступные детали', error: 'Нужно выбрать файл',
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

function QuestionIcon() {
  return <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M7.9 7.5a2.2 2.2 0 1 1 3.7 1.6c-.9.7-1.6 1.1-1.6 2.4M10 14.4v.1" /></svg>;
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
  return <section className="internal-link-board" aria-labelledby="link-board-title">
    <header className="link-board-heading">
      <div><h1 id="link-board-title">Модули</h1></div>
      <b><strong>{String(sections.length).padStart(2, '0')}</strong><span>модулей</span></b>
    </header>
    <div className="link-board-grid">
      {sections.map((section, index) => <button className={`link-board-item link-${section}`} key={section} onClick={() => onOpen(section)}>
        <span className="link-board-copy"><small className="link-board-index">МОДУЛЬ {String(index + 1).padStart(2, '0')}</small><strong>{labels[section]}</strong><small className="link-board-description">{sectionDetails[section]}</small></span>
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10h11M10 5l5 5-5 5" /></svg>
      </button>)}
    </div>
  </section>;
}

function ScanReportPage({ report }: { report: ScanReport | null }) {
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
    <header className="report-page-heading"><div><h1 id="report-page-title">Последнее сканирование</h1><p>{report ? `${report.fileName} · ${new Date(report.processedAt).toLocaleString()}` : 'Отчёт появится после первого сканирования MapData.sav.'}</p></div><b>Данные остаются на этом компьютере</b></header>
    {report ? <>
      <div className="report-overview" aria-label="Сводка сканирования">
        <div><strong>{report.total}</strong><span>закреплённых объектов</span></div>
        <div><strong>{report.stockpiles.length}</strong><span>с доступными деталями</span></div>
        <div><strong>{report.incompleteCount}</strong><span>без игровых деталей</span></div>
        <div><strong>{itemCount}</strong><span>строк предметов</span></div>
      </div>
      {!!report.incompleteCount && <section className="report-incomplete" aria-labelledby="report-incomplete-title">
        <h2 id="report-incomplete-title">Объекты без последних деталей</h2>
        <p>{report.incompleteCount} закреплённых объектов. Файл содержит их тип и сектор, но не содержимое. Причину — скрытый склад или запись из прошлой войны — определить по этим данным нельзя.</p>
        {!!unavailableGroups.length ? <ul>{unavailableGroups.map((group) => <li key={group.type}><span className="report-incomplete-type"><strong>{stockpileNames[group.type] ?? readableCode(group.type)}</strong><small>{group.type}</small></span><span>{[...group.hexes].map((hex) => hexNames[hex] ?? readableCode(hex)).join(', ')}{group.count > group.hexes.size ? ` · ${group.count} объектов` : ''}</span></li>)}</ul>
          : <small>В старом отчёте сохранено только их число. После следующего локального сканирования здесь появятся типы объектов и секторы.</small>}
      </section>}
      <div className="report-stockpiles-heading"><h2>Содержимое складов</h2><label><span>Фильтр</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Склад, город, предмет…" /></label></div>
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
            <summary><span className="report-stockpile-name"><strong>{stockpileNames[type] ?? readableCode(type)}</strong><small>{[stockpile.town, hexNames[fmt(stockpile.hex)] ?? readableCode(fmt(stockpile.hex))].filter(Boolean).join(' · ')}</small></span><span className="report-stockpile-faction">{factionNames[fmt(stockpile.faction)] ?? fmt(stockpile.faction)}</span><span className="report-stockpile-items">{items.length} позиций</span><span className="report-stockpile-caret" aria-hidden="true">⌄</span></summary>
            <div className="report-stockpile-meta"><span>Тип <b>{stockpileNames[type] ?? readableCode(type)}</b></span><span>Город <b>{fmt(stockpile.town)}</b></span><span>Сектор <b>{hexNames[fmt(stockpile.hex)] ?? readableCode(fmt(stockpile.hex))}</b></span><span>Резерв <b>{stockpile.is_reserve ? 'Да' : 'Нет'}</b></span><span title={coordinateTitle}>Координаты <b>{coordinateValue}</b></span><span>Обновлён <b>{timestamp}</b></span></div>
            {items.length ? <table className="report-items-table"><thead><tr><th>Предмет</th><th>Количество</th><th>Упаковка</th></tr></thead><tbody>{items.map((item, itemIndex) => <tr key={`${fmt(item.code)}-${itemIndex}`}><td>{fmt(item.code)}</td><td>{fmt(item.quantity)}</td><td>{item.crated ? 'В ящике' : 'Штучно'}</td></tr>)}</tbody></table> : <p className="report-no-items">В доступных деталях нет предметов.</p>}
          </details>;
        })}
        {!filtered.length && <p className="report-no-items">По этому запросу ничего не найдено.</p>}
      </div>
    </> : <p className="report-no-items">Завершите первое сканирование, чтобы получить сводку и содержимое складов.</p>}
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
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shell = document.querySelector<HTMLElement>('.desktop-shell');
    let accentRgb = '244 63 82';
    let accentForeground = '#ff8994';
    const syncPalette = () => {
      const palette = getComputedStyle(shell ?? document.documentElement);
      accentRgb = palette.getPropertyValue('--accent-rgb').trim() || accentRgb;
      accentForeground = palette.getPropertyValue('--accent-fg').trim() || accentForeground;
    };
    syncPalette();
    const paletteObserver = new MutationObserver(syncPalette);
    paletteObserver.observe(shell ?? document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
    const ripples: Array<{ x: number; y: number; startedAt: number }> = [];
    const drops: Array<{ x: number; startY: number; targetY: number; startedAt: number; impacted: boolean }> = [];
    const dripSources: Array<{ x: number; y: number; nextDropAt: number }> = [];
    let nextSourceSync = 0;
    let canvasRect = canvas.getBoundingClientRect();
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvasRect = rect;
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - lastDraw < 33) return;
      lastDraw = now;
      context.clearRect(0, 0, width, height);
      context.font = '12px "Cascadia Mono", "JetBrains Mono", monospace';
      context.textBaseline = 'middle';
      const swing = reduceMotion ? 0 : Math.sin(now * (active ? 0.00014 : 0.0001));
      const flowPhase = reduceMotion ? 0 : now * (active ? 0.00052 : 0.00038);
      const advection = Math.sin(flowPhase) * width * 0.22;
      if (scene === 'links' && !reduceMotion && now >= nextSourceSync) {
        canvasRect = canvas.getBoundingClientRect();
        const currentSources = [...document.querySelectorAll<HTMLElement>('.link-board-item')].map((item) => {
          const rect = item.getBoundingClientRect();
          return { x: rect.left + rect.width / 2 - canvasRect.left, y: rect.bottom - canvasRect.top };
        }).filter((source) => source.x >= 0 && source.x <= width && source.y >= 0 && source.y < height);
        const previous = [...dripSources];
        dripSources.splice(0, dripSources.length, ...currentSources.map((source, index) => ({
          ...source,
          nextDropAt: previous[index]?.nextDropAt ?? now + 650 + index * 530 + Math.random() * 2200,
        })));
        nextSourceSync = now + 400;
        for (const source of dripSources) {
          if (now < source.nextDropAt) continue;
          drops.push({ x: source.x, startY: source.y, targetY: height * 0.88, startedAt: now, impacted: false });
          source.nextDropAt = now + 4700 + Math.random() * 5400;
        }
      }
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        if (now - ripples[index].startedAt > (reduceMotion ? 650 : 2600)) ripples.splice(index, 1);
      }
      for (let index = drops.length - 1; index >= 0; index -= 1) {
        const drop = drops[index];
        const age = now - drop.startedAt;
        const fallDuration = 1150;
        if (age >= fallDuration && !drop.impacted) {
          ripples.push({ x: drop.x, y: drop.targetY, startedAt: now });
          drop.impacted = true;
        }
        if (age > fallDuration + 2600) { drops.splice(index, 1); continue; }
        if (age < fallDuration) {
          const progress = age / fallDuration;
          const y = drop.startY + (drop.targetY - drop.startY) * progress;
          const alpha = 0.35 + Math.sin(progress * Math.PI) * 0.45;
          context.fillStyle = `rgb(${accentRgb} / ${alpha})`;
          context.fillText(' . ', drop.x - cellWidth, y - cellHeight * 1.3);
          context.fillText(' {@} ', drop.x - cellWidth * 1.5, y);
          context.fillText('  #  ', drop.x - cellWidth * 1.5, y + cellHeight);
        }
      }
      const columns = Math.ceil(width / cellWidth);
      const rows = Math.ceil(height / cellHeight);
      const companionSourceX = width * 0.19;
      const companionSourceY = height * 0.56;
      const clockX = width * 0.19;
      const clockY = height * 0.22;
      const puddleY = height * 0.86;
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = column * cellWidth;
          const y = row * cellHeight;
          let ripple = 0;
          for (const origin of ripples) {
            const age = (now - origin.startedAt) / 1000;
            if (scene === 'links') {
              const distance = Math.hypot((x - origin.x) / (width * 0.54), (y - origin.y) / (height * 0.12));
              const radius = reduceMotion ? 0.48 : age / 2.4;
              const fade = reduceMotion ? 0.85 : Math.max(0, 1 - age / 2.6);
              ripple += Math.exp(-Math.abs(distance - radius) / 0.075) * fade;
            }
          }
          ripple = Math.min(1, ripple);
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
          } else if (scene === 'links') {
            const dx = (x - width * 0.5) / Math.max(width * 0.62, 1);
            const dy = (y - puddleY) / Math.max(height * 0.42, 1);
            const radius = Math.hypot(dx * 0.82, dy);
            const angle = Math.atan2(dy, dx);
            const currentRadius = 0.34 + 0.055 * Math.sin(flowPhase * 1.3 - angle * 2.2 + radius * 5);
            const current = Math.exp(-Math.pow((radius - currentRadius) / 0.16, 2));
            const outerSurge = Math.exp(-Math.pow((radius - (0.68 + swing * 0.06)) / 0.12, 2));
            const pool = Math.exp(-Math.pow((y - puddleY) / (height * 0.17), 2));
            turbulence = 0.5 + 0.5 * Math.sin(x * 0.009 + flowPhase * 1.4 + Math.sin(y * 0.012 - angle));
            density = Math.min(1, current * (0.38 + turbulence * 0.26) + outerSurge * 0.24 + pool * (0.12 + turbulence * 0.1));
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
          if (density < 0.045 && ripple < 0.025) continue;
          const index = Math.max(1, Math.min(glyphs.length - 1, Math.floor((density * 9 + turbulence * 6 + Math.abs(offset) / cellHeight) % glyphs.length)));
          const alpha = scene === 'links'
            ? Math.min(0.48, 0.11 + density * 0.42 + ripple * 0.44)
            : Math.min(scene === 'companion' ? 0.24 : 0.31, 0.022 + density * (scene === 'companion' ? 0.2 : 0.255) + ripple * 0.12);
          context.fillStyle = ripple > 0.2 && ((column + row) % 4 === 0)
            ? accentForeground
            : `rgb(${accentRgb} / ${alpha})`;
          if (ripple > 0.2 && ((column + row) % 4 === 0)) context.globalAlpha = Math.min(0.68, alpha + 0.18);
          context.fillText(glyphs[index], x, y);
          context.globalAlpha = 1;
        }
      }
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); paletteObserver.disconnect(); };
  }, [active, scene]);
  return <canvas ref={canvasRef} className="ascii-flow" aria-hidden="true" />;
}

export default function DesktopShell() {
  const [openTabs, setOpenTabs] = React.useState<DesktopTab[]>(['companion']);
  const [active, setActive] = React.useState<DesktopTab>('companion');
  const tabHistory = React.useRef<DesktopTab[]>(['companion']);
  const historyCursor = React.useRef(0);
  const [historyPosition, setHistoryPosition] = React.useState(0);
  const [frameHistory, setFrameHistory] = React.useState({ canBack: false, canForward: false });
  const [status, setStatus] = React.useState<ScanStatus>({ state: 'waiting', folder: null, fileName: null, message: 'Ищу MapData.sav в папке сохранений Foxhole.' });
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
      const data = event.data as { type?: string; canBack?: boolean; canForward?: boolean; direction?: string; theme?: string };
      if (data?.type === 'chronomancer:theme-change') {
        const candidate = data.theme === 'dark' ? 'red' : data.theme;
        if (typeof candidate === 'string' && ['red', 'lime', 'light', 'amber', 'contrast', 'noir', 'soft', 'ascii'].includes(candidate)) {
          document.querySelector('.desktop-shell')?.setAttribute('data-skin', candidate);
        }
      } else if (sourceFrame === frame && data?.type === 'chronomancer:history-state') {
        setFrameHistory({ canBack: Boolean(data.canBack), canForward: Boolean(data.canForward) });
      } else if (sourceFrame === frame && data?.type === 'chronomancer:history-fallback') {
        moveTabHistory(data.direction === 'forward' ? 1 : -1);
      }
    };
    document.addEventListener('auxclick', onAuxClick);
    window.addEventListener('message', onFrameMessage);
    return () => {
      document.removeEventListener('auxclick', onAuxClick);
      window.removeEventListener('message', onFrameMessage);
    };
  }, [moveTabHistory, navigateHistory]);

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
    api.getCompanionStatus().then((next) => { if (next?.state) setStatus(next); }).catch(() => {});
    api.getLastScanReport().then(setLastReport).catch(() => {});
    refreshProfile();
    const profileTimer = window.setInterval(refreshProfile, 20000);
    const unlisten = api.onCompanionStatus((next) => {
      if (next?.state) setStatus(next);
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
  const totalStockpiles = (status.stockpiles?.length ?? 0) + (status.incompleteCount ?? 0);

  return <main className="desktop-shell">
    <AsciiFlow active={status.state === 'processing'} scene={active === 'companion' ? 'companion' : active === 'links' ? 'links' : 'other'} />
    <header className="desktop-topbar">
      <div className="desktop-brand"><span className="desktop-mark" title="Chronomancer"><img src="/chronomancer-icon.png" width={44} height={44} alt="" /></span><span>Chronomancer</span><i>FOXHOLE LOGI</i></div>
      <div className="desktop-topbar-actions">
        <div className="desktop-live"><b className={status.state === 'error' ? 'is-error' : status.state === 'processing' ? 'is-working' : ''} />{status.state === 'processing' ? 'Локальное сканирование' : 'Компаньон активен'}</div>
        <button type="button" className="desktop-global-settings" onClick={openSettings} aria-label="Настройки" title="Настройки"><SettingsIcon /></button>
        <div className="desktop-window-controls" aria-label="Управление окном">
          <button type="button" onClick={() => void getApi()?.minimizeWindow()} aria-label="Свернуть окно" title="Свернуть"><WindowActionIcon kind="minimize" /></button>
          <button type="button" onClick={() => void getApi()?.toggleMaximizeWindow().then(setWindowMaximized)} aria-label={windowMaximized ? 'Восстановить окно' : 'Развернуть окно'} title={windowMaximized ? 'Восстановить' : 'Развернуть'}><WindowActionIcon kind={windowMaximized ? 'restore' : 'maximize'} /></button>
          <button type="button" className="window-close" onClick={() => void getApi()?.closeWindow()} aria-label="Скрыть Chronomancer в трей" title="Скрыть в трей"><WindowActionIcon kind="close" /></button>
        </div>
      </div>
    </header>

    <nav className="desktop-tabs" aria-label="Вкладки Chronomancer">
      <div className="desktop-history-controls" aria-label="История переходов">
        <button type="button" onClick={() => navigateHistory(-1)} disabled={!frameHistory.canBack && historyPosition === 0} aria-label="Назад" title="Назад"><HistoryIcon direction="back" /></button>
        <button type="button" onClick={() => navigateHistory(1)} disabled={!frameHistory.canForward && historyPosition >= tabHistory.current.length - 1} aria-label="Вперёд" title="Вперёд"><HistoryIcon direction="forward" /></button>
      </div>
      <div className="desktop-tab-item">
        <button type="button" className={`desktop-tab ${active === 'companion' ? 'is-active' : ''}`} onClick={() => navigateTab('companion')} aria-current={active === 'companion' ? 'page' : undefined}>
          <span>{labels.companion}</span>
        </button>
        <button type="button" className="desktop-add-tab" onClick={() => openSection('links')} aria-label="Добавить вкладку: открыть разделы Chronomancer" title="Открыть все разделы"><PlusIcon /></button>
      </div>
      {openTabs.filter((tab) => tab !== 'companion').map((tab) => <div key={tab} className="desktop-tab-item">
        <button type="button" className={`desktop-tab ${active === tab ? 'is-active' : ''}`} onClick={() => navigateTab(tab)} aria-current={active === tab ? 'page' : undefined}>
          <span>{labels[tab]}</span>
        </button>
        <button type="button" className="desktop-tab-close" onClick={() => closeTab(tab)} aria-label={`Закрыть: ${labels[tab]}`} title={`Закрыть ${labels[tab]}`}>×</button>
      </div>)}
    </nav>

    <section className="desktop-content">
      {openTabs.map((tab) => {
        if (tab === 'links') return <div key={tab} className="native-page link-board-page" style={{ display: active === tab ? 'block' : 'none' }}><InternalLinkBoard onOpen={openSection} /></div>;
        if (tab === 'report') return <div key={tab} className="native-page" style={{ display: active === tab ? 'block' : 'none' }}><ScanReportPage report={lastReport} /></div>;
        if (tab !== 'companion') return <iframe key={`${tab}-${reloadKey}`} className="desktop-section-frame" title={labels[tab]} src={`app://sindaris/section.html?tab=${tab}${tab === 'tools' && authQuery ? `&${authQuery}` : ''}`} style={{ display: active === tab ? 'block' : 'none' }} />;
        return <div key={tab} className="companion-page" style={{ display: active === tab ? 'block' : 'none' }}>
        <div className={`companion-desktop${status.state === 'processing' ? ' is-scanning' : ''}`}>
          <aside className="guardian-rail" aria-label="Маскот локального сканера">
            <img className="guardian-portrait" src="/chronomancer-mascot.png" width={1070} height={1536} alt="Хрономант в полный рост" />
          </aside>
          <div className="companion-workspace">
            <div className="companion-page-inner">
          <header className="companion-hero">
            <div>
              <h1>Склады под контролем.</h1>
              <p>Сканер читает сохранение прямо на этом компьютере.</p>
            </div>
          </header>

          <div className="companion-layout">
            <section className={`scan-panel scan-${status.state}`} aria-labelledby="save-file-title">
              <div className="scan-panel-heading">
                <div className="scan-panel-title"><span className="scan-panel-icon"><FolderIcon /></span><h2 id="save-file-title">Файл сохранения</h2>
                  <details className="save-help">
                    <summary aria-label="Где найти MapData.sav" title="Где найти файл"><QuestionIcon /></summary>
                    <div className="save-help-popover"><strong>Где найти MapData.sav</strong><p>Обычно Foxhole сохраняет файл здесь:</p><code>%LOCALAPPDATA%\Foxhole\Saved\SaveGames</code><p>Найдите файл с именем, оканчивающимся на <code>_MapData.sav</code>, и выберите его. Компаньон будет перечитывать его при обновлении.</p></div>
                  </details>
                </div>
                <span className="scan-state"><i />{statusNames[status.state]}</span>
              </div>

              <div className="scan-file-row">
                <span className="scan-file-mark"><FolderIcon /></span>
                <div className="scan-file-copy"><strong>{status.fileName ?? (status.state === 'error' ? 'Файл не найден' : 'Идёт поиск MapData.sav…')}</strong><span>{status.folder ?? '%LOCALAPPDATA%/Foxhole/Saved/SaveGames'}</span></div>
                <button className="button-primary" onClick={chooseFile}>{status.fileName ? 'Сменить файл' : 'Найти файл'}</button>
              </div>

              <div className="scan-feedback" role="status" aria-live="polite">
                <span className="scan-feedback-light" />
                <div><strong>{statusNames[status.state]}</strong><p>{status.message}</p></div>
              </div>
            </section>

            <section className="account-panel" aria-labelledby="account-title">
              {serverSetupOpen ? <>
                <div className="account-copy"><h2 id="account-title">Выберите сервер Discord</h2><p>Укажите клан для сайта. Данные сканирования пока остаются только на этом компьютере.</p></div>
                {serverSetupLoading ? <p className="server-setup-status" role="status">Получаю список доступных серверов…</p> : serverSetup ? <div className="server-picker-list">
                  {!!serverSetup.joins.length && <div className="server-picker-group"><strong>Кланы, в которые можно вступить</strong>
                    {serverSetup.joins.map((join) => <button className="server-choice" key={`join-${join.clanId}`} disabled={serverSetupBusy} onClick={() => void chooseDiscordContext({ joinClanId: join.clanId })}>
                      {join.iconUrl ? <img src={join.iconUrl} alt="" width={36} height={36} loading="lazy" /> : <span className="server-choice-mark">{join.name.slice(0, 1).toUpperCase()}</span>}
                      <span className="server-choice-copy"><b>{join.name}</b><small>Вступить · {({ basic: 'базовый', medium: 'средний', high: 'высокий' } as Record<string, string>)[join.level] ?? 'базовый'} уровень{join.roles.length ? ` · ${join.roles.slice(0, 2).join(', ')}` : ''}</small></span><span className="server-choice-arrow">›</span>
                    </button>)}
                  </div>}
                  {!!serverSetup.guilds.length && <div className="server-picker-group"><strong>Ваши Discord-серверы</strong>
                    {serverSetup.guilds.map((guild) => <button className="server-choice" key={`guild-${guild.id}`} disabled={serverSetupBusy} onClick={() => void chooseDiscordContext({ guildId: guild.id })}>
                      {guild.iconUrl ? <img src={guild.iconUrl} alt="" width={36} height={36} loading="lazy" /> : <span className="server-choice-mark">{guild.name.slice(0, 1).toUpperCase()}</span>}
                      <span className="server-choice-copy"><b>{guild.name}</b><small>{guild.clanId ? `Клан · ${guild.clanName || guild.clanId}` : 'Создать клан на этом сервере'}</small></span><span className="server-choice-arrow">›</span>
                    </button>)}
                  </div>}
                  {!!serverSetup.memberships.length && <div className="server-picker-group"><strong>Мои кланы</strong>
                    {serverSetup.memberships.map((membership) => <button className="server-choice" key={`membership-${membership.clanId}`} disabled={serverSetupBusy} onClick={() => void chooseDiscordContext({ clanId: membership.clanId })}>
                      <span className="server-choice-mark">{membership.clanName.slice(0, 1).toUpperCase()}</span><span className="server-choice-copy"><b>{membership.clanName}</b><small>Войти · {membership.role}</small></span><span className="server-choice-arrow">›</span>
                    </button>)}
                  </div>}
                  {!serverSetup.joins.length && !serverSetup.guilds.length && !serverSetup.memberships.length && <p className="server-setup-status">Для аккаунта пока не найдено доступных кланов.</p>}
                </div> : null}
                {serverSetupError && <p className="server-setup-error" role="alert">{serverSetupError}</p>}
                <button className="server-setup-cancel" onClick={() => { setServerSetupOpen(false); setServerSetupError(''); }}>Назад к компаньону</button>
              </> : profile ? <>
                <div className="account-copy"><h2 id="account-title">Профиль Chronomancer</h2><p>{profile.clanId ? `Активный сервер: ${profile.clanName || profile.clanId}. Отправка данных скана выключена.` : 'Вход выполнен. Отправка данных скана выключена.'}</p></div>
                <div className="companion-profile">
                  {profile.avatarUrl ? <img className="companion-avatar" src={profile.avatarUrl} alt={`Аватар ${profile.displayName}`} width={43} height={43} /> : <span className="companion-avatar companion-avatar-fallback">{profile.displayName.slice(0, 1).toUpperCase()}</span>}
                  <div className="companion-profile-copy"><strong>{profile.displayName}</strong><span>Discord · Chronomancer</span></div>
                  <span className={`level-badge level-${profile.level}`} title="Уровень доступа на сайте">
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2 6 3.5v7L10 18l-6-5.5v-7z"/><path d="m7 10 2 2 4-4"/></svg>
                    {({ owner: 'Командир', high: 'Высокий', medium: 'Средний', basic: 'Базовый', custom: 'Особый', guest: 'Гость' } as const)[profile.level]}
                  </span>
                </div>
                {profile.clanId && <div className="server-context"><span className="server-context-icon">{profile.clanAvatarUrl ? <img src={profile.clanAvatarUrl} alt="" width={29} height={29} /> : profile.clanName.slice(0, 1).toUpperCase()}</span><div><strong>{profile.clanName || profile.clanId}</strong><small>Контекст сайта · {profile.clanId}</small></div></div>}
                <button className="profile-server-change" onClick={login}>Выбрать сервер Discord</button>
              </> : profileLoading ? <div className="account-copy"><h2 id="account-title">Проверяю аккаунт</h2><p>Сверяю текущий вход Chronomancer.</p></div>
                : profileUnavailable ? <div className="account-copy"><h2 id="account-title">Нет связи с сайтом</h2><p>Статус входа пока не удалось проверить.</p><button className="profile-retry" onClick={refreshProfile}>Проверить снова</button></div>
                : <>
                <div className="account-copy"><h2 id="account-title">Ваш клан — в соседней вкладке</h2><p>Подключите аккаунт, чтобы открыть инструменты Chronomancer и данные клана.</p></div>
                <button className="button-discord" onClick={login}><DiscordIcon />Войти через Discord</button>
              </>}
            </section>

            <section className="scan-results" aria-labelledby="scan-results-title">
              <div className="scan-results-heading"><h2 id="scan-results-title">Последнее сканирование</h2><span>{status.processedAt ? new Date(status.processedAt).toLocaleTimeString() : 'Ожидание данных'}</span>
                <button className="report-button" onClick={openReport}>Посмотреть последний отчёт</button>
              </div>
              {status.processedAt ? <div className="scan-results-count"><strong>{totalStockpiles}</strong><span>закреплённых объектов</span><i />
                <div><b>{status.stockpiles?.length ?? 0}</b><span>с доступными деталями</span></div>
                {!!status.incompleteCount && <div className="scan-incomplete"><b>{status.incompleteCount}</b><span>без игровых деталей</span></div>}
              </div> : <p className="scan-empty">{status.state === 'processing' ? 'Жду окончания локального сканирования.' : 'Результаты появятся после первого сканирования MapData.sav.'}</p>}
              {(status.stockpiles?.length ?? 0) > 0 && <div className="stockpile-list">{status.stockpiles!.map((stockpile, index) => <div className="stockpile-row" key={`${fmt(stockpile.name)}-${index}`}><b>{fmt(stockpile.name ?? stockpile.type)}</b><span>{fmt(stockpile.hex)}</span><span>{Array.isArray(stockpile.items) ? `${stockpile.items.length} поз.` : 'Детали доступны'}</span></div>)}</div>}
              {!!status.incompleteCount && <p className="scan-incomplete-note">Эти объекты не считаются пустыми: игра не предоставила их последние детали.</p>}
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
