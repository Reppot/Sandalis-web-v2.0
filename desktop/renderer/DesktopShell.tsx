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
type DesktopApi = {
  chooseSaveFile: () => Promise<ScanStatus>;
  getCompanionStatus: () => Promise<ScanStatus>;
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

function ScannerIcon({ active }: { active: boolean }) {
  return <svg className={`scanner-icon${active ? ' is-active' : ''}`} viewBox="0 0 88 88" fill="none" aria-hidden="true">
    <rect className="scanner-icon-shell" x="11" y="11" width="66" height="66" rx="20" />
    <path className="scanner-icon-frame" d="M28 31v-5a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v5M28 57v5a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4v-5" />
    <path className="scanner-icon-beam" d="M25 44h38" />
    <path className="scanner-icon-corner" d="M25 39v10M63 39v10" />
    <circle className="scanner-icon-dot" cx="44" cy="44" r="3" />
  </svg>;
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

function BackgroundContours() {
  return <svg className="companion-contours" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M715-50c-99 73-158 117-173 177-21 83 104 103 94 180-9 66-112 85-127 156-12 56 45 100 116 111 90 14 154-22 213-4 62 19 70 77 38 148" />
      <path d="M756-50c-100 77-157 125-164 179-10 74 91 95 82 167-8 60-96 80-110 139-13 55 37 89 99 97 82 11 143-24 205-4 59 19 82 65 58 137" />
      <path d="M798-50c-100 81-151 129-153 179-2 65 75 86 68 151-6 55-81 75-94 126-13 52 28 77 81 83 75 8 134-27 196-5 55 19 92 53 78 124" />
      <path d="M838-50c-98 83-145 132-143 178 2 57 60 77 53 136-7 50-66 68-79 112-14 49 21 66 64 69 69 5 123-29 187-6 51 18 98 43 96 110" />
      <path d="M880-50c-95 85-137 133-132 176 5 48 46 67 39 120-7 44-52 62-64 99-14 45 15 55 48 56 62 2 113-32 177-7 46 18 102 33 112 95" />
      <path d="M940-50c-83 81-119 127-110 167 9 39 35 56 28 103-7 38-37 54-48 83-14 39 10 43 32 43 55 0 100-31 161-7 44 17 97 31 126 70" />
    </g>
  </svg>;
}

export default function DesktopShell() {
  const [openTabs, setOpenTabs] = React.useState<DesktopTab[]>(['companion']);
  const [active, setActive] = React.useState<DesktopTab>('companion');
  const [status, setStatus] = React.useState<ScanStatus>({ state: 'waiting', folder: null, fileName: null, message: 'Ищу MapData.sav в папке сохранений Foxhole.' });
  const [reloadKey, setReloadKey] = React.useState(0);
  const [authQuery, setAuthQuery] = React.useState('');
  const [showMenu, setShowMenu] = React.useState(false);

  React.useEffect(() => {
    const api = getApi();
    if (!api) return;
    api.getCompanionStatus().then((next) => { if (next?.state) setStatus(next); }).catch(() => {});
    return api.onCompanionStatus((next) => { if (next?.state) setStatus(next); });
  }, []);

  React.useEffect(() => {
    const api = getApi();
    if (!api) return;
    return api.onAuthComplete((state) => {
      const next: DesktopTab = openTabs.includes('tools') ? 'tools' : 'companion';
      setOpenTabs((tabs) => tabs.includes(next) ? tabs : [...tabs, next]);
      setActive(next);
      const query = new URLSearchParams();
      if (state.setup) query.set('setup', state.setup);
      if (state.error) query.set('error', state.error);
      setAuthQuery(query.toString());
      setReloadKey((n) => n + 1);
    });
  }, [openTabs]);

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
      {openTabs.map((tab) => <button key={tab} className={`desktop-tab ${active === tab ? 'is-active' : ''}`} onClick={() => setActive(tab)} aria-current={active === tab ? 'page' : undefined}>
        <span>{labels[tab]}</span>{tab !== 'companion' && <span className="desktop-tab-close" onClick={(event) => { event.stopPropagation(); closeTab(tab); }} aria-label={`Закрыть: ${labels[tab]}`}>×</span>}
      </button>)}
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
        <BackgroundContours />
        <div className="companion-page-inner">
          <header className="companion-hero">
            <div>
              <h1>Склады под контролем.</h1>
              <p>Сканер читает сохранение прямо на этом компьютере. Файл остаётся у вас.</p>
            </div>
            <div className="scanner-mark"><ScannerIcon active={status.state === 'processing'} /><span>{status.state === 'processing' ? 'ЧИТАЮ ФАЙЛ' : 'СКАНЕР ГОТОВ'}</span></div>
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
              <div className="account-copy"><h2 id="account-title">Ваш клан — в соседней вкладке</h2><p>Подключите аккаунт, чтобы открыть разделы Sindaris и данные клана.</p></div>
              <button className="button-discord" onClick={login}><DiscordIcon />Войти через Discord</button>
            </section>

            <section className="scan-results" aria-labelledby="scan-results-title">
              <div className="scan-results-heading"><h2 id="scan-results-title">Последнее сканирование</h2><span>{status.processedAt ? new Date(status.processedAt).toLocaleTimeString() : 'Ожидание данных'}</span></div>
              {status.processedAt ? <div className="scan-results-count"><strong>{totalStockpiles}</strong><span>закреплённых объектов</span><i />
                <div><b>{status.stockpiles?.length ?? 0}</b><span>с доступными деталями</span></div>
                {!!status.incompleteCount && <div className="scan-incomplete"><b>{status.incompleteCount}</b><span>без игровых деталей</span></div>}
              </div> : <p className="scan-empty">{status.state === 'processing' ? 'Жду окончания локального сканирования.' : 'Результаты появятся после первого сканирования MapData.sav.'}</p>}
              {(status.stockpiles?.length ?? 0) > 0 && <div className="stockpile-list">{status.stockpiles!.map((stockpile, index) => <div className="stockpile-row" key={`${fmt(stockpile.name)}-${index}`}><b>{fmt(stockpile.name ?? stockpile.type)}</b><span>{fmt(stockpile.hex)}</span><span>{Array.isArray(stockpile.items) ? `${stockpile.items.length} поз.` : 'Детали доступны'}</span></div>)}</div>}
              {!!status.incompleteCount && <p className="scan-incomplete-note">Эти объекты не считаются пустыми: игра не предоставила их последние детали.</p>}
            </section>
          </div>
        </div>
      </div> : <iframe key={`${tab}-${reloadKey}`} className="desktop-section-frame" title={labels[tab]} src={`app://sindaris/section.html?tab=${tab}${tab === 'tools' && authQuery ? `&${authQuery}` : ''}`} style={{ display: active === tab ? 'block' : 'none' }} />)}
    </section>
  </main>;
}
