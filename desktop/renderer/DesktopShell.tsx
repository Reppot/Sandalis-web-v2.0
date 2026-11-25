import * as React from 'react';
import './desktop.css';

type DesktopTab = 'companion' | 'tools' | 'clan' | 'guide' | 'feedback' | 'mail' | 'support' | 'cabinet';
type ScanStatus = {
  state: 'waiting' | 'processing' | 'ready' | 'partial' | 'error';
  folder: string | null;
  fileName: string | null;
  message: string;
  stockpiles?: Array<Record<string, unknown>>;
  incompleteCount?: number;
  processedAt?: string | null;
};
type CompanionProfile = { displayName: string; avatarUrl: string | null; clanId: string; clanName: string; clanAvatarUrl: string | null; level: 'owner' | 'high' | 'medium' | 'basic' | 'custom' | 'guest' };
type ScanReport = { processedAt: string; fileName: string; stockpiles: Array<Record<string, unknown>>; incompleteCount: number; total: number };
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
  onCompanionStatus: (callback: (status: ScanStatus) => void) => () => void;
  onAuthComplete: (callback: (state: Record<string, string>) => void) => () => void;
};

const getApi = () => typeof window === 'undefined' ? undefined : (window as Window & { sindarisDesktop?: DesktopApi }).sindarisDesktop;
const labels: Record<DesktopTab, string> = {
  companion: 'Компаньон', tools: 'Инструменты', clan: 'Клан', guide: 'Руководство',
  feedback: 'Обратная связь', mail: 'Почта', support: 'Поддержка', cabinet: 'Настройки',
};
const sections = Object.keys(labels).filter((key) => key !== 'companion') as Exclude<DesktopTab, 'companion'>[];
const statusNames: Record<ScanStatus['state'], string> = {
  waiting: 'Поиск файла', processing: 'Сканирование', ready: 'Готово', partial: 'Есть недоступные детали', error: 'Нужно выбрать файл',
};
const fmt = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '—';

function MenuIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
}

function QuestionIcon() {
  return <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M7.9 7.5a2.2 2.2 0 1 1 3.7 1.6c-.9.7-1.6 1.1-1.6 2.4M10 14.4v.1" /></svg>;
}

function FolderIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" /><path d="M3.5 10h17" /></svg>;
}

function DiscordIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M19.7 5.2a18.5 18.5 0 0 0-4.5-1.4l-.6 1.3a17.2 17.2 0 0 0-5.2 0l-.6-1.3a18.4 18.4 0 0 0-4.5 1.4C1.5 9.4.7 13.5 1.1 17.5a18.2 18.2 0 0 0 5.5 2.8l1.2-2a11.8 11.8 0 0 1-1.9-.9l.5-.4a13 13 0 0 0 11.2 0l.5.4a11.8 11.8 0 0 1-1.9.9l1.2 2a18.2 18.2 0 0 0 5.5-2.8c.5-4.6-.8-8.7-3.2-12.3ZM8.8 14.7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Zm6.4 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Z" /></svg>;
}

function AsciiFlow({ active }: { active: boolean }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;
    let frame = 0;
    let lastDraw = 0;
    let width = 0;
    let height = 0;
    const cellWidth = 9;
    const cellHeight = 14;
    const glyphs = ' .,:;+=/\\|(){}[]<>01#@*';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ripples: Array<{ x: number; y: number; startedAt: number }> = [];
    const host = canvas.parentElement;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('button')) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      ripples.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, startedAt: performance.now() });
    };
    host?.addEventListener('click', onClick);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
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
      if (now - lastDraw < 55) return;
      lastDraw = now;
      context.clearRect(0, 0, width, height);
      context.font = '12px "Cascadia Mono", "JetBrains Mono", monospace';
      context.textBaseline = 'middle';
      const swing = reduceMotion ? 0 : Math.sin(now * (active ? 0.0002 : 0.00014));
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        if (now - ripples[index].startedAt > (reduceMotion ? 650 : 2100)) ripples.splice(index, 1);
      }
      const columns = Math.ceil(width / cellWidth);
      const rows = Math.ceil(height / cellHeight);
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = column * cellWidth;
          const y = row * cellHeight;
          let ripple = 0;
          for (const origin of ripples) {
            const age = (now - origin.startedAt) / 1000;
            const distance = Math.hypot(x - origin.x, y - origin.y);
            const radius = reduceMotion ? 76 : age * 190;
            const fade = reduceMotion ? 1 : Math.max(0, 1 - age / 2.1);
            ripple += Math.exp(-Math.abs(distance - radius) / (reduceMotion ? 15 : 27)) * fade;
          }
          ripple = Math.min(1, ripple);
          const along = x / Math.max(width, 1);
          const centerY = height * (0.5 + 0.17 * Math.sin(along * Math.PI * 2.2 + swing * 1.25)
            + 0.065 * Math.sin(along * Math.PI * 6.4 - swing * 0.8));
          const thickness = height * (0.17 + 0.025 * Math.sin(along * 9 + swing));
          const offset = y - centerY;
          const mainStream = Math.exp(-Math.pow(offset / thickness, 2) * 0.8);
          const upperCurrent = Math.exp(-Math.pow((offset + height * 0.23) / (thickness * 0.48), 2)) * 0.46;
          const lowerCurrent = Math.exp(-Math.pow((offset - height * 0.22) / (thickness * 0.52), 2)) * 0.38;
          const vortexX = width * (0.5 + swing * 0.34);
          const vortexY = height * (0.5 - swing * 0.12);
          const dx = (x - vortexX) / Math.max(width, 1);
          const dy = (y - vortexY) / Math.max(height, 1);
          const radius = Math.hypot(dx, dy * 0.92);
          const angle = Math.atan2(dy, dx);
          const curl = (0.5 + 0.5 * Math.sin(radius * 58 - angle * 3 + swing * 2.4)) * Math.exp(-radius * 2.2);
          const turbulence = 0.5 + 0.5 * Math.sin(x * 0.012 + y * 0.007 + swing * 4 + Math.sin(y * 0.014 - swing * 1.8));
          const density = Math.min(1, (mainStream * 0.6 + upperCurrent + lowerCurrent + curl * 0.3) * (0.72 + turbulence * 0.28));
          if (density < 0.065 && ripple < 0.025) continue;
          const index = Math.max(1, Math.min(glyphs.length - 1, Math.floor((density * 9 + turbulence * 6 + Math.abs(offset) / cellHeight) % glyphs.length)));
          const alpha = Math.min(0.21, 0.025 + density * 0.15 + ripple * 0.12);
          context.fillStyle = ripple > 0.2 && ((column + row) % 4 === 0)
            ? `rgba(255, 238, 238, ${Math.min(0.26, alpha + 0.06)})`
            : `rgba(${turbulence > 0.84 ? '255, 104, 116' : '214, 45, 62'}, ${alpha})`;
          context.fillText(glyphs[index], x, y);
        }
      }
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); host?.removeEventListener('click', onClick); };
  }, [active]);
  return <canvas ref={canvasRef} className="ascii-flow" aria-hidden="true" />;
}

export default function DesktopShell() {
  const [openTabs, setOpenTabs] = React.useState<DesktopTab[]>(['companion']);
  const [active, setActive] = React.useState<DesktopTab>('companion');
  const [status, setStatus] = React.useState<ScanStatus>({ state: 'waiting', folder: null, fileName: null, message: 'Ищу MapData.sav в папке сохранений Foxhole.' });
  const [reloadKey, setReloadKey] = React.useState(0);
  const [authQuery, setAuthQuery] = React.useState('');
  const [showMenu, setShowMenu] = React.useState(false);
  const [profile, setProfile] = React.useState<CompanionProfile | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(true);
  const [profileUnavailable, setProfileUnavailable] = React.useState(false);
  const [lastReport, setLastReport] = React.useState<ScanReport | null>(null);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [serverSetup, setServerSetup] = React.useState<DiscordSetup | null>(null);
  const [serverSetupOpen, setServerSetupOpen] = React.useState(false);
  const [serverSetupLoading, setServerSetupLoading] = React.useState(false);
  const [serverSetupBusy, setServerSetupBusy] = React.useState(false);
  const [serverSetupError, setServerSetupError] = React.useState('');

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
    const unlisten = api.onCompanionStatus((next) => { if (next?.state) setStatus(next); });
    return () => { window.clearInterval(profileTimer); unlisten(); };
  }, [refreshProfile]);

  React.useEffect(() => {
    const api = getApi();
    if (!api) return;
    return api.onAuthComplete((state) => {
      const choosingServer = state.setup === 'guild';
      const next: DesktopTab = choosingServer ? 'companion' : openTabs.includes('tools') ? 'tools' : 'companion';
      setOpenTabs((tabs) => tabs.includes(next) ? tabs : [...tabs, next]);
      setActive(next);
      const query = new URLSearchParams();
      if (state.error) query.set('error', state.error);
      setAuthQuery(query.toString());
      setReloadKey((n) => n + 1);
      if (choosingServer) void loadServerSetup();
      else refreshProfile();
    });
  }, [openTabs, refreshProfile, loadServerSetup]);

  const openSection = (tab: Exclude<DesktopTab, 'companion'>) => {
    setOpenTabs((tabs) => tabs.includes(tab) ? tabs : [...tabs, tab]);
    setActive(tab);
    setShowMenu(false);
  };
  const closeTab = (tab: DesktopTab) => {
    if (tab === 'companion') return;
    const next = openTabs.filter((item) => item !== tab);
    setOpenTabs(next);
    if (active === tab) setActive(next[Math.max(0, openTabs.indexOf(tab) - 1)] ?? 'companion');
  };
  const chooseFile = async () => { const api = getApi(); if (api) { const next = await api.chooseSaveFile(); if (next?.state) setStatus(next); } };
  const login = async () => { await getApi()?.openDiscordLogin(); };
  const totalStockpiles = (status.stockpiles?.length ?? 0) + (status.incompleteCount ?? 0);

  return <main className="desktop-shell">
    <header className="desktop-topbar">
      <div className="desktop-brand"><span className="desktop-mark">S</span><span>SINDARIS</span><i>DESKTOP</i></div>
      <div className="desktop-live"><b className={status.state === 'error' ? 'is-error' : status.state === 'processing' ? 'is-working' : ''} />{status.state === 'processing' ? 'Локальное сканирование' : 'Компаньон активен'}</div>
    </header>

    <nav className="desktop-tabs" aria-label="Вкладки Sindaris">
      {openTabs.map((tab) => <div key={tab} className="desktop-tab-item">
        <button type="button" className={`desktop-tab ${active === tab ? 'is-active' : ''}`} onClick={() => setActive(tab)} aria-current={active === tab ? 'page' : undefined}>
          <span>{labels[tab]}</span>
        </button>
        {tab !== 'companion' && <button type="button" className="desktop-tab-close" onClick={() => closeTab(tab)} aria-label={`Закрыть: ${labels[tab]}`} title={`Закрыть ${labels[tab]}`}>×</button>}
      </div>)}
      <div className="desktop-menu-wrap">
        <button className={`desktop-menu-trigger${showMenu ? ' is-open' : ''}`} onClick={() => setShowMenu((value) => !value)} aria-label="Открыть меню разделов" aria-haspopup="menu" aria-expanded={showMenu}>
          <MenuIcon /><span>Меню</span>
        </button>
        {showMenu && <div className="desktop-section-menu" role="menu" aria-label="Разделы Sindaris">
          {sections.map((section) => <button key={section} role="menuitem" className={openTabs.includes(section) ? 'is-open' : ''} onClick={() => openSection(section)}>
            <span>{labels[section]}</span><small>{openTabs.includes(section) ? 'Открыть вкладку' : 'Новая вкладка'}</small>
          </button>)}
        </div>}
      </div>
    </nav>

    <section className="desktop-content">
      {openTabs.map((tab) => tab === 'companion' ? <div key={tab} className="companion-page" style={{ display: active === tab ? 'block' : 'none' }}>
        <div className={`companion-desktop${status.state === 'processing' ? ' is-scanning' : ''}`}>
          <AsciiFlow active={status.state === 'processing'} />
          <aside className="guardian-rail" aria-label="Маскот локального сканера">
            <img className="guardian-portrait" src="/ascii-guardian.png" width={1070} height={1536} alt="ASCII-страж в полный рост, сотканный из символов и красных водяных рябей" />
            <div className="guardian-status"><i aria-hidden="true" />{status.state === 'processing' ? 'СКАНИРУЮ' : 'НА ПОСТУ'}</div>
          </aside>
          <div className="companion-workspace">
            <div className="companion-page-inner">
          <header className="companion-hero">
            <div>
              <h1>Склады под контролем.</h1>
              <p>Сканер читает сохранение прямо на этом компьютере. Файл остаётся у вас.</p>
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
                <div className="account-copy"><h2 id="account-title">Аккаунт Sindaris</h2><p>{profile.clanId ? `Активный сервер: ${profile.clanName || profile.clanId}. Отправка данных скана выключена.` : 'Вход выполнен. Отправка данных скана выключена.'}</p></div>
                <div className="companion-profile">
                  {profile.avatarUrl ? <img className="companion-avatar" src={profile.avatarUrl} alt={`Аватар ${profile.displayName}`} width={43} height={43} /> : <span className="companion-avatar companion-avatar-fallback">{profile.displayName.slice(0, 1).toUpperCase()}</span>}
                  <div className="companion-profile-copy"><strong>{profile.displayName}</strong><span>Discord · Sindaris</span></div>
                  <span className={`level-badge level-${profile.level}`} title="Уровень доступа на сайте">
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2 6 3.5v7L10 18l-6-5.5v-7z"/><path d="m7 10 2 2 4-4"/></svg>
                    {({ owner: 'Командир', high: 'Высокий', medium: 'Средний', basic: 'Базовый', custom: 'Особый', guest: 'Гость' } as const)[profile.level]}
                  </span>
                </div>
                {profile.clanId && <div className="server-context"><span className="server-context-icon">{profile.clanAvatarUrl ? <img src={profile.clanAvatarUrl} alt="" width={29} height={29} /> : profile.clanName.slice(0, 1).toUpperCase()}</span><div><strong>{profile.clanName || profile.clanId}</strong><small>Контекст сайта · {profile.clanId}</small></div></div>}
                <button className="profile-server-change" onClick={login}>Выбрать сервер Discord</button>
              </> : profileLoading ? <div className="account-copy"><h2 id="account-title">Проверяю аккаунт</h2><p>Сверяю текущий вход Sindaris.</p></div>
                : profileUnavailable ? <div className="account-copy"><h2 id="account-title">Нет связи с сайтом</h2><p>Статус входа пока не удалось проверить.</p><button className="profile-retry" onClick={refreshProfile}>Проверить снова</button></div>
                : <>
                <div className="account-copy"><h2 id="account-title">Ваш клан — в соседней вкладке</h2><p>Подключите аккаунт, чтобы открыть разделы Sindaris и данные клана.</p></div>
                <button className="button-discord" onClick={login}><DiscordIcon />Войти через Discord</button>
              </>}
            </section>

            <section className="scan-results" aria-labelledby="scan-results-title">
              <div className="scan-results-heading"><h2 id="scan-results-title">Последнее сканирование</h2><span>{status.processedAt ? new Date(status.processedAt).toLocaleTimeString() : 'Ожидание данных'}</span>
                <button className="report-button" aria-expanded={reportOpen} aria-controls="last-scan-report" onClick={() => setReportOpen((open) => !open)}>{reportOpen ? 'Скрыть отчёт' : 'Посмотреть последний отчёт'}</button>
              </div>
              {status.processedAt ? <div className="scan-results-count"><strong>{totalStockpiles}</strong><span>закреплённых объектов</span><i />
                <div><b>{status.stockpiles?.length ?? 0}</b><span>с доступными деталями</span></div>
                {!!status.incompleteCount && <div className="scan-incomplete"><b>{status.incompleteCount}</b><span>без игровых деталей</span></div>}
              </div> : <p className="scan-empty">{status.state === 'processing' ? 'Жду окончания локального сканирования.' : 'Результаты появятся после первого сканирования MapData.sav.'}</p>}
              {(status.stockpiles?.length ?? 0) > 0 && <div className="stockpile-list">{status.stockpiles!.map((stockpile, index) => <div className="stockpile-row" key={`${fmt(stockpile.name)}-${index}`}><b>{fmt(stockpile.name ?? stockpile.type)}</b><span>{fmt(stockpile.hex)}</span><span>{Array.isArray(stockpile.items) ? `${stockpile.items.length} поз.` : 'Детали доступны'}</span></div>)}</div>}
              {!!status.incompleteCount && <p className="scan-incomplete-note">Эти объекты не считаются пустыми: игра не предоставила их последние детали.</p>}
              {reportOpen && <div className="last-report" id="last-scan-report" aria-live="polite">
                {lastReport ? <>
                  <div className="last-report-heading"><div><strong>Отчёт локального сканирования</strong><span>{lastReport.fileName} · {new Date(lastReport.processedAt).toLocaleString()}</span></div><b>{lastReport.total} объектов</b></div>
                  {lastReport.stockpiles.length ? <div className="stockpile-list">{lastReport.stockpiles.map((stockpile, index) => <div className="stockpile-row" key={`report-${fmt(stockpile.name)}-${index}`}><b>{fmt(stockpile.name ?? stockpile.type)}</b><span>{fmt(stockpile.hex)}</span><span>{Array.isArray(stockpile.items) ? `${stockpile.items.length} поз.` : 'Детали доступны'}</span></div>)}</div> : <p className="scan-empty">В сохранении не найдено объектов с доступными деталями.</p>}
                  {!!lastReport.incompleteCount && <p className="scan-incomplete-note">Ещё {lastReport.incompleteCount} закреплённых объектов без игровых деталей. Они не считаются пустыми.</p>}
                  <p className="report-local-note">Отчёт хранится только на этом компьютере.</p>
                </> : <p className="scan-empty">Отчёта пока нет. Он появится после первого завершённого сканирования.</p>}
              </div>}
            </section>
          </div>
        </div>
          </div>
        </div>
      </div> : <iframe key={`${tab}-${reloadKey}`} className="desktop-section-frame" title={labels[tab]} src={`app://sindaris/section.html?tab=${tab}${tab === 'tools' && authQuery ? `&${authQuery}` : ''}`} style={{ display: active === tab ? 'block' : 'none' }} />)}
    </section>
  </main>;
}
