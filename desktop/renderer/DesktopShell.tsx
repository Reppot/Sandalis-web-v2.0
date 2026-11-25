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
  processedAt?: string;
};
type DesktopApi = {
  chooseSaveFolder: () => Promise<ScanStatus>;
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
  waiting: 'Ожидает', processing: 'Обработка', ready: 'Готово', partial: 'Есть недоступные детали', error: 'Ошибка',
};
const fmt = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '—';

export default function DesktopShell() {
  const [openTabs, setOpenTabs] = React.useState<DesktopTab[]>(['companion']);
  const [active, setActive] = React.useState<DesktopTab>('companion');
  const [status, setStatus] = React.useState<ScanStatus>({ state: 'waiting', folder: null, fileName: null, message: 'Выберите папку сохранений Foxhole.' });
  const [reloadKey, setReloadKey] = React.useState(0);
  const [authQuery, setAuthQuery] = React.useState('');
  const [showSections, setShowSections] = React.useState(false);

  React.useEffect(() => {
    const api = getApi();
    if (!api) return;
    api.getCompanionStatus().then(setStatus).catch(() => {});
    return api.onCompanionStatus(setStatus);
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

  const addTab = (section: Exclude<DesktopTab, 'companion'>) => {
    setOpenTabs((tabs) => tabs.includes(section) ? tabs : [...tabs, section]);
    setActive(section);
    setShowSections(false);
  };
  const closeTab = (tab: DesktopTab) => {
    if (tab === 'companion') return;
    const next = openTabs.filter((item) => item !== tab);
    setOpenTabs(next);
    if (active === tab) setActive(next[Math.max(0, openTabs.indexOf(tab) - 1)] ?? 'companion');
  };
  const chooseFolder = async () => { const api = getApi(); if (api) setStatus(await api.chooseSaveFolder()); };
  const login = async () => { await getApi()?.openDiscordLogin(); };

  return <main className="desktop-shell">
    <header className="desktop-topbar">
      <div className="desktop-brand"><span className="desktop-mark">S</span><span>SINDARIS</span><i>DESKTOP</i></div>
      <div className="desktop-live"><b className={status.state === 'error' ? 'is-error' : status.state === 'processing' ? 'is-working' : ''} />{status.state === 'processing' ? 'Локальное сканирование' : 'Компаньон активен'}</div>
    </header>

    <nav className="desktop-tabs" aria-label="Вкладки Sindaris">
      {openTabs.map((tab) => <button key={tab} className={`desktop-tab ${active === tab ? 'is-active' : ''}`} onClick={() => setActive(tab)}>
        <span>{labels[tab]}</span>{tab !== 'companion' && <span className="desktop-tab-close" onClick={(event) => { event.stopPropagation(); closeTab(tab); }} aria-label={`Закрыть: ${labels[tab]}`}>×</span>}
      </button>)}
      <div className="desktop-add-wrap">
        <button className="desktop-add-tab" onClick={() => setShowSections((v) => !v)} aria-label="Открыть раздел Sindaris">＋</button>
        {showSections && <div className="desktop-section-menu">{sections.filter((section) => !openTabs.includes(section)).map((section) => <button key={section} onClick={() => addTab(section)}>{labels[section]}</button>)}</div>}
      </div>
    </nav>

    <section className="desktop-content">
      {openTabs.map((tab) => tab === 'companion' ? <div key={tab} className="companion-page" style={{ display: active === tab ? 'block' : 'none' }}>
        <div className="companion-heading"><div><p className="companion-eyebrow">SINDARIS · WINDOWS</p><h1>Ваш Foxhole-компаньон</h1><p>Читает закреплённые объекты из локального MapData.sav и обновляет результат при изменении сохранения.</p></div><div className="companion-orbit"><span>FS</span><i /></div></div>
        <div className="companion-grid">
          <article className="companion-card companion-card-main">
            <div className="card-kicker">ЛОКАЛЬНЫЙ СБОР</div><h2>Папка сохранений</h2>
            <p className="card-copy">Выберите SaveGames. Компаньон будет отслеживать MapData.sav, пока приложение запущено, в том числе когда окно скрыто в трей.</p>
            <div className="folder-row"><div className="folder-icon">⌁</div><div className="folder-path">{status.folder ?? 'Папка не выбрана'}<small>{status.fileName ?? 'Ожидание MapData.sav'}</small></div><button className="button-primary" onClick={chooseFolder}>Выбрать папку</button></div>
            <div className={`processing-status status-${status.state}`}><span className="status-pulse" /><div><b>{statusNames[status.state]}</b><p>{status.message}</p></div></div>
          </article>
          <article className="companion-card companion-login-card">
            <div className="card-kicker">SINDARIS</div><h2>Подключить аккаунт</h2><p className="card-copy">Войдите через Discord, чтобы открыть разделы и данные вашего клана.</p>
            <button className="button-discord" onClick={login}><span className="discord-mark">◉</span>Войти через Discord</button>
            <p className="privacy-note"><span>●</span> SAV-файл остаётся на этом компьютере. Отправка результатов выключена.</p>
          </article>
          <article className="companion-card companion-summary">
            <div className="summary-title"><div><div className="card-kicker">РЕЗУЛЬТАТ ПОСЛЕДНЕГО ЧТЕНИЯ</div><h2>{status.stockpiles?.length ?? 0}<small> объектов с деталями</small></h2></div><div className="summary-symbol">⌗</div></div>
            <div className="summary-meta"><span>ФАЙЛ</span><b>{status.fileName ?? '—'}</b><span>ОБРАБОТАН</span><b>{status.processedAt ? new Date(status.processedAt).toLocaleTimeString() : '—'}</b></div>
            {!!status.incompleteCount && <div className="incomplete-note"><strong>{status.incompleteCount} закреплённых объекта без деталей</strong><span>Игра не предоставила последние данные. Они не считаются пустыми складами.</span></div>}
          </article>
      {(status.stockpiles?.length ?? 0) > 0 && <article className="companion-card companion-results"><div className="card-kicker">ЗАКРЕПЛЁННЫЕ ОБЪЕКТЫ</div><div className="stockpile-list">{status.stockpiles!.map((stockpile, index) => <div className="stockpile-row" key={`${fmt(stockpile.name)}-${index}`}><b>{fmt(stockpile.name ?? stockpile.type)}</b><span>{fmt(stockpile.hex)}</span><span>{Array.isArray(stockpile.items) ? `${stockpile.items.length} поз.` : 'Детали доступны'}</span></div>)}</div></article>}
        </div>
      </div> : <iframe key={`${tab}-${reloadKey}`} className="desktop-section-frame" title={labels[tab]} src={`app://sindaris/section.html?tab=${tab}${tab === 'tools' && authQuery ? `&${authQuery}` : ''}`} style={{ display: active === tab ? 'block' : 'none' }} />)}
    </section>
  </main>;
}
