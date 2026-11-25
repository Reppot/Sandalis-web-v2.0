// Главы руководства «Навигация»: тексты (ru/en/cs), кадры и пояснения к интерфейсу.
// notes[].sel проверяет, что описанный экранный элемент попал в снимок; поверх снимка ничего не рисуется.
// mode: "viewport" — весь экран; { clip: "<css>" } — только элемент.

const L = (ru, en, cs) => ({ ru, en, cs });
const RE = (ru, en) => ({ ru, en });
const g = (id) => `[data-guide="${id}"]`;

export const CHAPTERS = [
  {
    key: "start",
    icon: "terminal",
    title: L("Вход и первые шаги", "Signing in", "Přihlášení a první kroky"),
    summary: L(
      "Терминал работает через Discord: командир создаёт клан из своего Discord-сервера, бойцы вступают по ссылке-приглашению, а гость может пользоваться инструментами без входа.",
      "The terminal uses Discord: the commander creates the clan from their Discord server, soldiers join with an invite link, and guests can use the tools without signing in.",
      "Terminál funguje přes Discord: velitel založí klan ze svého Discord serveru, vojáci vstupují přes pozvánkový odkaz a host může používat nástroje bez přihlášení.",
    ),
    shots: [
      {
        id: "login",
        path: "/",
        loggedOut: true,
        mode: { clip: ".auth-panel" },
        caption: L("Экран входа", "Sign-in screen", "Přihlašovací obrazovka"),
        notes: [
          { sel: g("login-lang"), note: L("Язык интерфейса: русский, английский или чешский. Выбор запоминается.", "Interface language: Russian, English or Czech. Your choice is remembered.", "Jazyk rozhraní: ruština, angličtina nebo čeština. Volba se zapamatuje.") },
          { sel: g("login-discord"), note: L("Вход через Discord. Сайт попросит доступ к списку ваших серверов и ролям на них — по ним вы вступаете в клан.", "Sign in with Discord. The site asks for your server list and your roles there — that is how you join a clan.", "Přihlášení přes Discord. Web požádá o seznam vašich serverů a rolí na nich — podle nich vstoupíte do klanu.") },
          { sel: g("login-owner"), note: L("Владелец Discord-сервера клана после входа выбирает сервер и становится командиром с полными правами.", "The owner of the clan's Discord server picks the server after signing in and becomes the commander with full rights.", "Vlastník Discord serveru klanu po přihlášení vybere server a stane se velitelem s plnými právy.") },
          { sel: g("login-guest"), note: L("Гостевой доступ: калькуляторы, база кодов и обучение. Данные кланов гостю не видны.", "Guest access: calculators, code base and training. Clan data is never shown to guests.", "Přístup hosta: kalkulačky, databáze kódů a výcvik. Data klanů host nevidí.") },
        ],
      },
      {
        id: "setup",
        path: "/?setup=guild",
        loggedOut: true,
        setupCookie: true,
        mode: { clip: ".auth-panel" },
        caption: L("Выбор после входа: вступить в клан или создать свой", "After sign-in: join a clan or create your own", "Po přihlášení: vstoupit do klanu nebo založit vlastní"),
        notes: [
          { sel: `${g("setup-joins")} li:nth-child(1) button`, note: L("Клан вашего сервера, где командир подключил терминал: «Вступить в терминал клана…». Рядом — ваши роли на сервере и уровень доступа, который они дают.", "A clan of your server whose commander connected the terminal: “Join the terminal of clan…”. Next to it — your server roles and the access level they give.", "Klan vašeho serveru, jehož velitel připojil terminál: „Vstoupit do terminálu klanu…“. Vedle jsou vaše role na serveru a úroveň přístupu, kterou dávají.") },
          { sel: `${g("setup-guilds")} li:nth-child(1) button`, note: L("Сервер, уже привязанный к клану терминала, — вход командиром этого клана.", "A server already linked to a terminal clan — enter that clan as its commander.", "Server už propojený s klanem terminálu — vstup jako velitel tohoto klanu.") },
          { sel: `${g("setup-guilds")} li:nth-child(2) button`, note: L("Новый сервер: будет создан клан с названием и иконкой сервера, вы станете командиром.", "A new server: a clan is created with the server's name and icon, and you become its commander.", "Nový server: vznikne klan s názvem a ikonou serveru a vy se stanete velitelem.") },
          { sel: g("setup-members"), note: L("Кланы, где вы уже состоите, — вход с вашим текущим уровнем доступа.", "Clans you already belong to — enter with your current access level.", "Klany, kde už jste členem — vstup s vaší současnou úrovní přístupu.") },
          { sel: g("setup-back"), note: L("Назад к экрану входа. Список действует 15 минут после входа через Discord.", "Back to the sign-in screen. The list is valid for 15 minutes after the Discord sign-in.", "Zpět na přihlášení. Seznam platí 15 minut po přihlášení přes Discord.") },
        ],
      },
    ],
  },
  {
    key: "layout",
    icon: "map",
    title: L("Интерфейс терминала", "Terminal layout", "Rozhraní terminálu"),
    summary: L(
      "Шапка с бегущей строкой всегда остаётся сверху, слева — меню разделов. Вкладки, на которые у вас нет прав, не показываются.",
      "The header with the ticker always stays on top, the section menu is on the left. Tabs you have no rights for are hidden.",
      "Hlavička s běžícím řádkem zůstává vždy nahoře, vlevo je menu sekcí. Záložky, ke kterým nemáte práva, se nezobrazují.",
    ),
    shots: [
      {
        id: "shell",
        path: "/?tab=tools&tool=orders",
        mode: "viewport",
        caption: L("Главный экран", "Main screen", "Hlavní obrazovka"),
        notes: [
          { sel: g("shell-brand"), note: L("Герб и название терминала.", "Crest and terminal name.", "Erb a název terminálu.") },
          { sel: g("shell-ticker"), note: L("Бегущая строка: склады, которые скоро исчезнут (красный — меньше часа, оранжевый — меньше суток). Наведите курсор, чтобы остановить.", "Ticker: stockpiles about to expire (red — under an hour, orange — under a day). Hover to pause it.", "Běžící řádek: sklady, které brzy zmizí (červená — méně než hodina, oranžová — méně než den). Najetím ho zastavíte.") },
          { sel: g("shell-status"), note: L("Состояние связи с сервером, общий статус складов и время последней синхронизации.", "Server link status, overall stockpile status and the time of the last sync.", "Stav spojení se serverem, celkový stav skladů a čas poslední synchronizace.") },
          { sel: g("shell-nav"), note: L("Быстрый доступ: Инструменты, Обучение и Навигация.", "Quick access: Tools, Training and Navigation.", "Rychlý přístup: Nástroje, Výcvik a Navigace.") },
          { sel: g("shell-collapse"), note: L("Свернуть или развернуть меню — останутся только иконки.", "Collapse or expand the menu — only icons stay visible.", "Sbalit nebo rozbalit menu — zůstanou jen ikony.") },
          { sel: g("shell-brand"), note: L("Нажмите на герб, чтобы вернуться в инструменты.", "Select the crest to return to Tools.", "Kliknutím na erb se vraťte do Nástrojů.") },
        ],
      },
      {
        id: "menu",
        path: "/?tab=tools&tool=orders",
        mode: "viewport",
        prepare: "openMobileMenu",
        viewport: { width: 390, height: 844 },
        caption: L("Меню разделов", "Section menu", "Menu sekcí"),
        notes: [
          { sel: `${g("shell-menu")} .sheet-row`, note: L("Разделы объединены по группам, у каждого есть короткое пояснение. Доступные пункты зависят от роли.", "Sections are grouped by task, with a short hint for each. Available entries depend on your role.", "Sekce jsou seskupené podle úkolů a každá má krátký popis. Dostupné položky závisí na roli.") },
          { sel: `${g("shell-menu")} .sheet-row.is-active`, note: L("Активный раздел отмечен в списке.", "The active section is marked in the list.", "Aktivní sekce je v seznamu označená.") },
        ],
      },
    ],
  },
  {
    key: "orders",
    icon: "orders",
    title: L("Заказы: склад и конструктор", "Orders: stockpile and builder", "Objednávky: sklad a konstruktor"),
    summary: L(
      "Слева — содержимое закреплённого склада клана, справа — конструктор заказа. Готовый заказ отправляется в штаб как рапорт.",
      "On the left is the pinned clan stockpile, on the right the order builder. A finished order is sent to HQ as a report.",
      "Vlevo je obsah připnutého skladu klanu, vpravo konstruktor objednávky. Hotová objednávka se odešle na štáb jako hlášení.",
    ),
    shots: [
      {
        id: "stockpile",
        path: "/?tab=tools&tool=orders",
        mode: { clip: g("stock-panel") },
        caption: L("Содержимое закреплённого склада", "Pinned stockpile contents", "Obsah připnutého skladu"),
        notes: [
          { sel: g("stock-select"), note: L("Выбор склада клана — он закрепляется за этой вкладкой.", "Pick a clan stockpile — it stays pinned to this tab.", "Výběr skladu klanu — zůstane připnutý k této záložce.") },
          { sel: g("stock-new"), note: L("Создать, переименовать или удалить склад (бойцы и выше).", "Create, rename or delete a stockpile (soldiers and above).", "Vytvořit, přejmenovat nebo smazat sklad (vojáci a výše).") },
          { sel: g("stock-load"), note: L("Загрузить отчёт сканера (JSON/TXT) — содержимое склада заменится.", "Load a scanner report (JSON/TXT) — the stockpile contents are replaced.", "Načíst výstup skeneru (JSON/TXT) — obsah skladu se nahradí.") },
          { sel: g("stock-paste"), note: L("Вставить строки из буфера обмена: «Название, 50» или «Название -> 50».", "Paste lines from the clipboard: “Name, 50” or “Name -> 50”.", "Vložit řádky ze schránky: „Název, 50“ nebo „Název -> 50“.") },
          { sel: g("stock-scan"), note: L("Распознать предметы прямо из файла сохранения MapData.sav.", "Recognise items straight from the MapData.sav save file.", "Rozpoznat předměty přímo ze souboru MapData.sav.") },
          { sel: g("stock-filter"), note: L("Фильтр позиций склада по названию или коду. Рядом — очистка склада.", "Filter stockpile lines by name or code. Next to it — clear the stockpile.", "Filtr položek skladu podle názvu nebo kódu. Vedle — vymazání skladu.") },
          { sel: g("stock-sync"), note: L("Когда и откуда склад обновлялся в последний раз.", "When and from which source the stockpile was last updated.", "Kdy a odkud byl sklad naposledy aktualizován.") },
          { sel: g("stock-list"), note: L("Позиции склада с иконками и количеством.", "Stockpile lines with icons and quantities.", "Položky skladu s ikonami a množstvím.") },
          { sel: `${g("stock-panel")} ${g("export-mode")}`, note: L("Режим нижних кнопок: экспорт отчёта или импорт данных.", "Mode of the buttons below: export a report or import data.", "Režim tlačítek dole: export hlášení nebo import dat.") },
          { sel: `${g("stock-panel")} ${g("export-formats")}`, note: L("TXT, таблица XLSX, картинки PNG для Discord или буфер обмена.", "TXT, an XLSX sheet, PNG images for Discord or the clipboard.", "TXT, tabulka XLSX, obrázky PNG pro Discord nebo schránka.") },
        ],
      },
      {
        id: "builder",
        path: "/?tab=tools&tool=orders",
        mode: { clip: g("builder-panel") },
        prepare: "pickMatrixItem",
        caption: L("Конструктор заказа", "Order builder", "Konstruktor objednávky"),
        notes: [
          { sel: g("builder-pick"), note: L("Выбранный предмет — нажмите на него в матрице ниже.", "The selected item — click it in the matrix below.", "Vybraný předmět — klikněte na něj v matici níže.") },
          { sel: g("builder-qty"), note: L("Количество. Enter сразу добавляет строку.", "Quantity. Enter adds the line right away.", "Množství. Enter řádek rovnou přidá.") },
          { sel: `${g("builder-panel")} .builder-unit`, note: L("Единица: ящики или штуки.", "Unit: crates or pieces.", "Jednotka: bedny nebo kusy.") },
          { sel: g("builder-add"), note: L("Добавить строку в заказ.", "Add the line to the order.", "Přidat řádek do objednávky.") },
          { sel: g("builder-filter"), note: L("Поиск по русскому и английскому названию или коду; под ним — категории.", "Search by Russian or English name or code; categories are below.", "Hledání podle ruského či anglického názvu nebo kódu; pod ním kategorie.") },
          { sel: g("builder-matrix"), note: L("Матрица предметов каталога.", "Catalog item matrix.", "Matice předmětů katalogu.") },
          { sel: g("builder-clear"), note: L("Очистить весь заказ (нужно подтвердить вторым нажатием).", "Clear the whole order (press again to confirm).", "Vymazat celou objednávku (potvrďte druhým stisknutím).") },
          { sel: g("builder-order"), note: L("Строки заказа: ± меняют количество, ✕ убирает строку. Черновик хранится в браузере.", "Order lines: ± change the quantity, ✕ removes a line. The draft is kept in the browser.", "Řádky objednávky: ± mění množství, ✕ řádek odebere. Koncept se ukládá v prohlížeči.") },
          { sel: g("builder-send"), note: L("Отправить рапорт в штаб — он появится в «Текущих заказах клана».", "Send the report to HQ — it appears in “Current clan orders”.", "Odeslat hlášení na štáb — objeví se v „Aktuálních objednávkách klanu“.") },
          { sel: `${g("builder-panel")} ${g("export-formats")}`, note: L("Выгрузить заказ без отправки: TXT, XLSX, PNG или буфер.", "Export the order without sending it: TXT, XLSX, PNG or clipboard.", "Exportovat objednávku bez odeslání: TXT, XLSX, PNG nebo schránka.") },
        ],
      },
    ],
  },
  {
    key: "reports",
    icon: "reports",
    title: L("Текущие заказы клана", "Current clan orders", "Aktuální objednávky klanu"),
    summary: L(
      "Все рапорты из конструктора: офицеры меняют статус, любой боец может выгрузить рапорт или отправить его в канал Discord клана.",
      "All reports from the builder: officers change their status, any soldier can export a report or post it to the clan's Discord channel.",
      "Všechna hlášení z konstruktoru: důstojníci mění stav, každý voják může hlášení exportovat nebo poslat do kanálu Discordu klanu.",
    ),
    shots: [
      {
        id: "reports",
        path: "/?tab=clan&view=reports",
        mode: { clip: "main" },
        caption: L("Очередь штаба", "HQ task queue", "Fronta úkolů štábu"),
        notes: [
          { sel: g("reports-filters"), note: L("Фильтр: текущие, выполненные, отменённые или все.", "Filter: current, completed, cancelled or all.", "Filtr: aktuální, splněné, zrušené nebo vše.") },
          { sel: g("reports-search"), note: L("Поиск по названию рапорта или предмету.", "Search by report title or item.", "Hledání podle názvu hlášení nebo předmětu.") },
          { sel: `${g("report-card")} .hq-row`, note: L("Каждая строка показывает заказ, нужные предметы, исполнителей, срок и ход выполнения. Нажмите, чтобы открыть карточку.", "Each row shows the task, requested items, assignees, deadline and progress. Open it to see the full task.", "Každý řádek ukazuje úkol, požadované předměty, řešitele, termín a průběh. Otevřete ho pro podrobnosti.") },
        ],
      },
      {
        id: "report-detail",
        path: "/?tab=clan&view=reports",
        mode: { clip: ".hq-drawer" },
        prepare: "expandReport",
        viewport: { width: 1440, height: 1440 },
        caption: RE("Карточка заказа", "Task details"),
        notes: [
          { sel: ".hq-steps", note: RE("Путь выполнения: открыт, в работе, выполнен. Доступные действия зависят от роли.", "Move a task through open, in progress and done. Available actions depend on your role.") },
          { sel: g("report-progress"), note: RE("Здесь участники отмечают фактически доставленное количество по каждой позиции.", "Members record how much of each requested item has actually arrived here.") },
          { sel: ".hq-drawer-actions", note: RE("Загрузить заказ в конструктор или отправить его в Discord.", "Load the order into the builder or post it to Discord.") },
          { sel: ".hq-doc summary", note: RE("В документе можно посмотреть и выгрузить состав заказа.", "The document section contains the order contents and export options.") },
        ],
      },
    ],
  },
  {
    key: "timers",
    icon: "timers",
    title: L("Таймеры деспавна складов", "Stockpile despawn timers", "Časovače despawnu skladů"),
    summary: L(
      "Склад в Foxhole исчезает через 48 часов без обновления. Терминал считает время для каждого склада клана и предупреждает в бегущей строке.",
      "A Foxhole stockpile disappears after 48 hours without a refresh. The terminal tracks the time for every clan stockpile and warns in the ticker.",
      "Sklad ve Foxhole zmizí po 48 hodinách bez obnovení. Terminál hlídá čas každého skladu klanu a varuje v běžícím řádku.",
    ),
    shots: [
      {
        id: "timers",
        path: "/?tab=clan&view=stockpiles",
        mode: { clip: "main" },
        caption: L("Матрица таймеров", "Timer matrix", "Matice časovačů"),
        notes: [
          { sel: g("timers-stats"), note: L("Сколько складов в зоне риска: меньше часа, меньше суток и в безопасности.", "How many stockpiles are at risk: under an hour, under a day and safe.", "Kolik skladů je v ohrožení: méně než hodina, méně než den a v bezpečí.") },
          { sel: g("timers-search"), note: L("Поиск по сектору или складу.", "Search by sector or stockpile.", "Hledání podle sektoru nebo skladu.") },
          { sel: g("stockpile-new"), note: L("Добавить склад на мониторинг: сектор, название и время последнего обновления.", "Add a stockpile to monitoring: region, name and time of its last refresh.", "Přidat sklad ke sledování: sektor, název a čas posledního obnovení.") },
          { sel: ".timer-card", note: L("Карточка склада: полоса показывает остаток от 48 часов, цвет — уровень риска.", "Stockpile card: the bar shows what is left of 48 hours, the colour shows the risk.", "Karta skladu: pruh ukazuje zbytek ze 48 hodin, barva míru rizika.") },
          { sel: g("timer-left"), note: L("Оставшееся время до исчезновения склада.", "Time left until the stockpile disappears.", "Zbývající čas do zmizení skladu.") },
          { sel: g("timer-manage"), note: L("Открыть канал связи склада: обновить таймер, журнал, снять с мониторинга.", "Open the stockpile channel: refresh the timer, log, stop monitoring.", "Otevřít kanál skladu: obnovit časovač, deník, ukončit sledování.") },
        ],
      },
      {
        id: "timer-modal",
        path: "/?tab=clan&view=stockpiles",
        mode: { clip: ".modal-panel" },
        prepare: "openTimer",
        caption: L("Канал связи склада", "Stockpile channel", "Komunikační kanál skladu"),
        notes: [
          { sel: g("tmodal-left"), note: L("Сколько осталось до исчезновения.", "Time left before it disappears.", "Kolik zbývá do zmizení.") },
          { sel: g("tmodal-log"), note: L("Журнал: кто и когда обновлял склад, заметки интендантов.", "Log: who refreshed the stockpile and when, quartermaster notes.", "Deník: kdo a kdy sklad obnovil, poznámky intendantů.") },
          { sel: g("tmodal-note"), note: L("Добавить заметку в журнал.", "Add a note to the log.", "Přidat poznámku do deníku.") },
          { sel: g("tmodal-time"), note: L("Точное время из игры: дни, часы, минуты.", "Exact time from the game: days, hours, minutes.", "Přesný čas ze hry: dny, hodiny, minuty.") },
          { sel: g("tmodal-reset"), note: L("После обновления склада в игре — сбросить на 48 часов одной кнопкой.", "After refreshing the stockpile in game — reset to 48 hours with one click.", "Po obnovení skladu ve hře — jedním tlačítkem nastavit 48 hodin.") },
          { sel: g("tmodal-set"), note: L("Задать введённое время.", "Apply the time you entered.", "Nastavit zadaný čas.") },
          { sel: g("tmodal-remove"), note: L("Снять склад с мониторинга (с подтверждением).", "Stop monitoring the stockpile (asks to confirm).", "Ukončit sledování skladu (s potvrzením).") },
        ],
      },
    ],
  },
  {
    key: "codes",
    icon: "codes",
    title: L("База кодов предметов", "Item code base", "Databáze kódů předmětů"),
    summary: L(
      "Справочник всех предметов Foxhole: технический код, английское и русское название, категория и фракция. Им пользуются сканер, склад и конструктор.",
      "A reference of every Foxhole item: technical code, English and Russian names, category and faction. The scanner, stockpile and builder rely on it.",
      "Přehled všech předmětů Foxhole: technický kód, anglický a ruský název, kategorie a frakce. Využívá ho skener, sklad i konstruktor.",
    ),
    shots: [
      {
        id: "codes",
        path: "/?tab=tools&tool=codes",
        mode: "viewport",
        caption: L("Реестр кодов", "Code registry", "Registr kódů"),
        notes: [
          { sel: g("codes-stats"), note: L("Всего записей, сколько с иконкой и сколько требуют проверки.", "Total records, how many have an icon and how many need review.", "Celkem záznamů, kolik má ikonu a kolik je třeba ověřit.") },
          { sel: g("codes-search"), note: L("Поиск по коду, английскому или русскому названию.", "Search by code, English or Russian name.", "Hledání podle kódu, anglického nebo ruského názvu.") },
          { sel: g("codes-filters"), note: L("Фильтры по категории и фракции.", "Category and faction filters.", "Filtry podle kategorie a frakce.") },
          { sel: g("codes-copy"), note: L("Скопировать отфильтрованные строки (JSON) или скачать CSV.", "Copy the filtered lines (JSON) or download a CSV.", "Zkopírovat filtrované řádky (JSON) nebo stáhnout CSV.") },
          { sel: g("codes-compare"), note: L("Сравнить сырую выгрузку склада из игры с реестром: что распознано, что нет.", "Compare a raw in-game stockpile export with the registry: what is recognised and what is not.", "Porovnat surový výpis skladu ze hry s registrem: co je rozpoznáno a co ne.") },
          { sel: g("codes-table"), note: L("Таблица реестра.", "The registry table.", "Tabulka registru.") },
        ],
      },
    ],
  },
  {
    key: "tools",
    icon: "tools",
    title: L("Каталог и калькуляторы", "Tool catalog and calculators", "Nástroje: kalkulačky"),
    summary: L(
      "Каталог объединяет заказы, пирамиду снабжения, планирование, базу кодов и производственные калькуляторы Facility, MPF, Factory и Refinery.",
      "The catalog brings together orders, the supply pyramid, planning, item codes, and Facility, MPF, Factory, and Refinery calculators.",
      "Kalkulačky továrny, MPF a rafinerie počítají suroviny, bedny a čas podle dat foxhole.wiki.gg. Níže jsou ověřené externí služby klanu.",
    ),
    shots: [
      {
        id: "tools-home",
        path: "/?tab=tools",
        mode: "viewport",
        caption: RE("Каталог инструментов", "Tools catalog"),
        notes: [
          { sel: ".tool-card", note: RE("Карточки открывают инструмент. Набор зависит от ваших прав и состояния входа.", "Cards open each tool. The available set depends on your access and sign-in state.") },
        ],
      },
      {
        id: "tools-tabs",
        path: "/?tab=tools&tool=mpf",
        mode: { clip: g("tools-tabs") },
        prepare: "openMpf",
        viewport: { width: 390, height: 844 },
        caption: RE("Навигация по инструментам", "Tool navigation"),
        notes: [
          { sel: `${g("tools-tabs")} .tools-back`, note: RE("Вернуться к каталогу, где инструменты собраны по задачам.", "Return to the catalog, where tools are grouped by task.") },
          { sel: `${g("tools-tabs")} [role=tab][aria-selected="true"]`, note: RE("Текущий раздел отмечен как выбранный.", "The current section is marked as selected.") },
        ],
      },
      {
        id: "mpf",
        path: "/?tab=tools&tool=mpf",
        mode: "viewport",
        prepare: "fillMpf",
        viewport: { width: 1440, height: 1200 },
        caption: L("Калькулятор MPF", "MPF calculator", "Kalkulačka MPF"),
        notes: [
          { sel: g("tool-mode"), note: L("PRODUCTION — игровые лимиты заказа; PLANNING — любое количество, разбивается на заказы.", "PRODUCTION — in-game order limits; PLANNING — any amount, split into orders.", "PRODUCTION — herní limity objednávky; PLANNING — libovolné množství rozdělené na objednávky.") },
          { sel: g("tool-search"), note: L("Поиск предмета; рядом — фильтр фракции.", "Item search; the faction filter is next to it.", "Hledání předmětu; vedle je filtr frakce.") },
          { sel: g("tool-cats"), note: L("Категории производства.", "Production categories.", "Kategorie výroby.") },
          { sel: ".factory-item-card", note: L("Карточка: ＋ добавляет ящик (в MPF первый клик сразу даёт минимальные 3), внизу — цена ящика.", "Card: ＋ adds a crate (in MPF the first click adds the minimum of 3), the crate price is at the bottom.", "Karta: ＋ přidá bednu (v MPF první klik rovnou přidá minimální 3), dole je cena bedny.") },
          { sel: ".factory-plan-row input", note: L("Количество ящиков в очереди — кнопки ± или ввод с клавиатуры.", "Crates in the queue — ± buttons or type a number.", "Počet beden ve frontě — tlačítka ± nebo zadání číslem.") },
          { sel: g("tool-remove"), note: L("Убрать позицию из очереди.", "Remove the item from the queue.", "Odebrat položku z fronty.") },
          { sel: g("tool-totals"), note: L("Итог: ресурсы со скидкой MPF, ящики, время и процент экономии.", "Totals: resources with the MPF discount, crates, time and the saving.", "Souhrn: suroviny se slevou MPF, bedny, čas a úspora.") },
          { sel: `aside ${g("export-formats")}`, note: L("Выгрузить расчёт или скопировать его кнопкой «Поделиться планом».", "Export the calculation or copy it with “Share plan”.", "Exportovat výpočet nebo ho zkopírovat tlačítkem „Sdílet plán“.") },
        ],
      },
    ],
  },
  {
    key: "planning",
    icon: "map",
    title: RE("Планирование операций", "Operation planning"),
    summary: RE(
      "Найдите регион поиском, выберите только нужные гексы: постройки загружаются по запросу. На карте можно рисовать линии, измерять расстояния и размещать метки плана.",
      "Search for a region and select only the hexes you need; building details load on demand. Draw lines, measure distances, and place plan markers on the map.",
    ),
    shots: [
      {
        id: "planning-overview",
        path: "/?tab=tools&tool=planning",
        mode: { clip: ".planning-page" },
        prepare: "checkPlanningOverview",
        caption: RE("Пустой обзор карты", "Empty map overview"),
        notes: [
          { sel: ".planning-region", note: RE("До выбора регионов показывается только обзорная карта без построек и данных фронта.", "Before regions are selected, the map shows an overview without buildings or front data.") },
          { sel: g("planning-region-search"), note: RE("Начните с поиска нужного региона. Карта загружается без заранее выбранных гексов.", "Start by searching for a region. The map opens with no hexes selected.") },
        ],
      },
      {
        id: "planning-regions",
        path: "/?tab=tools&tool=planning",
        mode: { clip: ".planning-page" },
        prepare: "openPlanning",
        caption: RE("Выбор гексов", "Selecting hexes"),
        notes: [
          { sel: g("planning-region-search"), note: RE("Найдите гекс или город и перейдите к нему. Поиск не выбирает регион и не загружает постройки.", "Find a hex or town and jump to it. Search does not select the region or load its buildings.") },
          { sel: g("planning-regions"), note: RE("Нажмите, чтобы включить выбор. Отметьте несколько гексов и завершите выбор.", "Turn on selection, choose multiple hexes, then finish." ) },
          { sel: g("planning-map"), note: RE("До выбора здесь нет маркеров построек. Подробности карты запрашиваются только для выбранных гексов.", "No building markers appear before selection. Map details are requested only for selected hexes.") },
          { sel: g("planning-frontline-toggle"), note: RE("Линия рассчитывается отдельно по расположению ратуш; она не включает маркеры построек карты.", "The frontline is calculated separately from town hall positions; it does not load map building markers.") },
        ],
      },
      {
        id: "planning-frontline",
        path: "/?tab=tools&tool=planning",
        mode: { clip: ".planning-page" },
        prepare: "showPlanningFrontline",
        caption: RE("Расчётная линия фронта", "Estimated frontline"),
        notes: [
          { sel: g("planning-frontline-toggle"), note: RE("Включите расчёт линии по взаимному расположению ратуш Варденов и Колонистов.", "Turn on the line calculated from Warden and Colonial town hall positions.") },
          { sel: ".planning-frontline", note: RE("Показывается линия фронта без маркеров построек; гексы по-прежнему не выбраны.", "The frontline appears without building markers; no hexes are selected yet.") },
        ],
      },
      {
        id: "planning-selected",
        path: "/?tab=tools&tool=planning",
        mode: { clip: ".planning-page" },
        prepare: "selectPlanningHex",
        caption: RE("Постройки выбранного гекса", "Buildings in a selected hex"),
        notes: [
          { sel: g("planning-regions"), note: RE("Число показывает, сколько гексов включено в план.", "The count shows how many hexes are included in the plan.") },
          { sel: ".planning-marker", note: RE("Маркеры с контрастным фоном показывают постройки, владельца и состояние города.", "High-contrast markers show structures, faction ownership, and town state.") },
        ],
      },
      {
        id: "planning-tools",
        path: "/?tab=tools&tool=planning",
        mode: { clip: g("planning-tools-panel") },
        prepare: "openPlanningTools",
        caption: RE("Сгруппированные инструменты", "Grouped planning tools"),
        notes: [
          { sel: g("planning-tool-tabs"), note: RE("Переключайте группы рисования, размещения объектов и правки.", "Switch between drawing, placing objects, and editing tools.") },
          { sel: g("planning-tool-freehand"), note: RE("Свободная линия рисуется мышью или касанием и сохраняется как редактируемый объект.", "Draw a freehand line with mouse or touch; it is saved as an editable object.") },
          { sel: g("planning-tool-ruler"), note: RE("Линейка показывает расстояние и азимут между двумя точками.", "The ruler measures distance and azimuth between two points.") },
        ],
      },
    ],
  },
  {
    key: "training",
    icon: "training",
    title: L("Обучение", "Training", "Výcvik"),
    summary: RE(
      "Курсы терминала и материалы вашего клана собраны в одном месте.",
      "Terminal courses and your clan's learning materials live in one place.",
    ),
    shots: [
      {
        id: "training",
        path: "/?tab=clan&view=training",
        mode: "viewport",
        prepare: "openTraining",
        caption: RE("Курсы и материалы", "Courses and learning materials"),
        notes: [
          { sel: ".training-switch", note: RE("Переключитесь между курсами терминала и материалами клана.", "Switch between terminal courses and clan materials.") },
          { sel: ".training-card", note: RE("Карточка показывает тему, краткое содержание и размер курса. Нажмите, чтобы открыть уроки.", "Each course card shows its topic, summary and size. Open it to browse the lessons.") },
        ],
      },
    ],
  },
  {
    key: "management",
    icon: "map",
    title: L("Управление (командир)", "Management (commander)", "Správa (velitel)"),
    summary: L(
      "Вкладка видна только командиру клана — владельцу Discord-сервера. Здесь список всех участников с ролями сервера и правами, уровни доступа ролей (пресеты базовый, средний, высокий или кастомный набор действий) и интеграции: канал Discord для рапортов и API-токены для ботов.",
      "Only the clan commander — the Discord server owner — sees this tab. It lists every member with their server roles and rights, sets each role's access (basic, medium, high presets or a custom set of actions) and holds integrations: the Discord channel for reports and API tokens for bots.",
      "Záložku vidí jen velitel klanu — vlastník Discord serveru. Je zde seznam všech členů s rolemi serveru a právy, úrovně přístupu rolí (předvolby základní, střední, vysoký nebo vlastní sada akcí) a integrace: kanál Discord pro hlášení a API tokeny pro boty.",
    ),
    shots: [
      {
        id: "mgmt-bot",
        path: "/?tab=clan&view=management",
        mode: { clip: g("mgmt-bot") },
        caption: L("Бот клана на Discord-сервере", "Clan bot on the Discord server", "Bot klanu na Discord serveru"),
        notes: [
          { sel: `${g("mgmt-bot")} .panel-title`, note: RE("Подключение Discord-бота для синхронизации серверных ролей и доступа участников.", "Connect the Discord bot to sync server roles and member access.") },
          { sel: `${g("mgmt-bot")} ol`, note: L("Три шага: сервер привязан к клану, бот добавлен, роли подтянуты. Выполненные отмечены ✔.", "Three steps: server linked, bot added, roles pulled. Done steps are marked ✔.", "Tři kroky: server propojen, bot přidán, role načteny. Hotové kroky mají ✔.") },
        ],
      },
      {
        id: "mgmt-members",
        path: "/?tab=clan&view=management",
        mode: { clip: g("mgmt-members") },
        prepare: "expandMember",
        caption: L("Участники клана", "Clan members", "Členové klanu"),
        notes: [
          { sel: `${g("mgmt-members")} input`, note: L("Поиск по имени участника или роли Discord.", "Search by member name or Discord role.", "Hledání podle jména člena nebo role Discordu.") },
          { sel: `${g("mgmt-members")} li`, note: L("Участник: роли на сервере, итоговый уровень и вступил ли он в терминал. Нажмите, чтобы увидеть его итоговые права.", "A member: server roles, resulting level and whether they joined the terminal. Click to see their effective rights.", "Člen: role na serveru, výsledná úroveň a zda vstoupil do terminálu. Kliknutím zobrazíte jeho výsledná práva.") },
          { sel: `${g("mgmt-members")} li .border-t`, note: L("Итоговые права участника — объединение прав всех его ролей.", "The member's effective rights — the union of all their roles.", "Výsledná práva člena — sjednocení práv všech jeho rolí.") },
        ],
      },
      {
        id: "mgmt-roles",
        path: "/?tab=clan&view=management",
        mode: { clip: g("mgmt-roles") },
        prepare: "openRolesTab",
        caption: L("Роли и уровни доступа", "Roles and access levels", "Role a úrovně přístupu"),
        notes: [
          { sel: g("mgmt-roles"), note: RE("После синхронизации выберите для каждой Discord-роли пресет доступа или задайте отдельные права.", "After syncing, assign each Discord role an access preset or configure permissions individually.") },
          { sel: `${g("mgmt-roles")} > p`, note: RE("Эта подсказка объясняет, почему настройки ролей могут быть недоступны до синхронизации.", "This hint explains why role settings may remain unavailable until roles are synced.") },
        ],
      },
      {
        id: "webhook",
        path: "/?tab=clan&view=management",
        mode: { clip: g("cab-webhook") },
        prepare: "openIntegrationsTab",
        caption: L("Интеграции: канал Discord для рапортов", "Integrations: Discord channel for reports", "Integrace: kanál Discord pro hlášení"),
        notes: [
          { sel: `${g("cab-webhook")} input`, note: L("URL вебхука канала: Discord → Настройки канала → Интеграции → Вебхуки → «Скопировать URL».", "Channel webhook URL: Discord → Channel settings → Integrations → Webhooks → “Copy Webhook URL”.", "URL webhooku kanálu: Discord → Nastavení kanálu → Integrace → Webhooky → „Kopírovat URL“.") },
          { sel: `${g("cab-webhook")} .btn-primary`, note: L("Сохранить. После этого в рапортах работает кнопка «В Discord».", "Save. After that the “To Discord” button works in reports.", "Uložit. Potom v hlášeních funguje tlačítko „Do Discordu“.") },
        ],
      },
      {
        id: "token",
        path: "/?tab=clan&view=management",
        mode: { clip: g("cab-token") },
        prepare: "openIntegrationsTab",
        caption: L("Интеграции: API-токен для бота", "Integrations: API token for a bot", "Integrace: API token pro bota"),
        notes: [
          { sel: `${g("cab-token")} p`, note: L("Зачем он нужен: только внешним программам клана (бот, скрипты, десктоп-клиент).", "What it is for: only the clan's external programs (bot, scripts, desktop client).", "K čemu je: jen pro externí programy klanu (bot, skripty, desktopový klient).") },
          { sel: `${g("cab-token")} input`, note: L("Название токена, например «discord-bot».", "Token name, e.g. “discord-bot”.", "Název tokenu, např. „discord-bot“.") },
          { sel: `${g("cab-token")} select`, note: L("Роль бота — чаще всего «Гость (только чтение)».", "The bot's role — usually “Guest (read only)”.", "Role bota — nejčastěji „Host (jen čtení)“.") },
          { sel: `${g("cab-token")} .btn-primary`, note: L("Выпустить токен. Он показывается один раз — сохраните его.", "Issue the token. It is shown only once — save it.", "Vydat token. Zobrazí se jen jednou — uložte si ho.") },
        ],
      },
    ],
  },
  {
    key: "cabinet",
    icon: "cabinet",
    title: L("Настройки", "Settings", "Nastavení"),
    summary: RE(
      "Профиль, язык, тема, уведомления и служебные настройки. Доступные разделы зависят от роли.",
      "Profile, language, theme, notifications and developer settings. Available sections depend on your role.",
    ),
    shots: [
      {
        id: "profile",
        path: "/?tab=cabinet",
        mode: "viewport",
        caption: L("Профиль участника", "Member profile", "Profil člena"),
        notes: [
          { sel: `${g("settings-sections")} [role=radio] >>0`, note: RE("Переключатель настроек: профиль, язык, тема, уведомления и служебные параметры (если доступны вашей роли).", "Settings switcher: profile, language, theme, notifications and developer options (if your role allows them).") },
          { sel: ".cabinet-hero .cabinet-pill >>1", note: L("Ваш уровень в клане: командир, высокий, средний доступ или рядовой.", "Your clan level: commander, high, medium access or private.", "Vaše úroveň v klanu: velitel, vysoký, střední přístup nebo řadový.") },
          { sel: ".cabinet-logout", note: L("Выйти из терминала на этом устройстве.", "Sign out of the terminal on this device.", "Odhlásit se z terminálu na tomto zařízení.") },
          { sel: ".cabinet-grid .cabinet-card", note: L("Данные участника: ID, позывной, клан и способ входа.", "Member details: ID, callsign, clan and sign-in method.", "Údaje člena: ID, volací znak, klan a způsob přihlášení.") },
          { sel: ".cabinet-roles", note: L("Права роли: что вам разрешено в терминале.", "Role rights: what you are allowed to do in the terminal.", "Práva role: co smíte v terminálu dělat.") },
        ],
      },
      {
        id: "language",
        path: "/?tab=cabinet",
        mode: { clip: g("cab-lang") },
        prepare: "openSettingsLanguage",
        caption: L("Язык интерфейса", "Interface language", "Jazyk rozhraní"),
        notes: [
          { sel: `${g("cab-lang")} [role=radiogroup]`, note: L("Русский и English поддерживаются в обновлённом руководстве. Другие доступные локали остаются без изменений.", "Russian and English are supported throughout the updated guide. Other available locales remain unchanged.", "Русский, English nebo Čeština. Volba se uloží do профilu, v tomto jazyce chodí i zprávy serverу.") },
        ],
      },
      {
        id: "appearance",
        path: "/?tab=cabinet",
        mode: { clip: g("settings-appearance") },
        prepare: "openSettingsAppearance",
        caption: L("Внешний вид", "Appearance", "Vzhled"),
        notes: [
          { sel: ".theme-choice", note: RE("Выберите одну из доступных тем. Выбор применяется сразу и сохраняется в этом браузере.", "Choose a theme. It applies immediately and is saved in this browser.") },
        ],
      },
    ],
  },
  {
    key: "pyramid",
    icon: "pyramid",
    title: RE("Пирамида снабжения", "Supply pyramid"),
    summary: RE(
      "Сравните состав выбранного плана с запасом склада, настройте уровни и отправьте недостающее в конструктор заказа.",
      "Compare a plan with warehouse stock, adjust its tiers, and send missing items to the order builder.",
    ),
    shots: [
      {
        id: "pyramid-config",
        path: "/?tab=tools&tool=pyramid",
        mode: { clip: g("pyramid-config") },
        caption: RE("Профиль снабжения", "Supply profile"),
        notes: [
          { sel: g("pyramid-config"), note: RE("Переключайте готовые профили базы или настройте собственный.", "Switch between base presets or configure a custom one.") },
        ],
      },
      {
        id: "pyramid-tiers",
        path: "/?tab=tools&tool=pyramid",
        mode: { clip: g("pyramid-tiers") },
        caption: RE("Уровни и потребность базы", "Base tiers and supply needs"),
        notes: [
          { sel: g("pyramid-tiers"), note: RE("Все ступени сохраняются. Здесь видны предметы, цель и текущий дефицит.", "All tiers are retained. This view shows items, targets, and the current deficit.") },
          { sel: g("pyramid-order"), note: RE("Выберите недостающие предметы и передайте их в конструктор заказа.", "Select missing items and send them to the order builder.") },
        ],
      },
    ],
  },
  {
    key: "calculators",
    icon: "tools",
    title: RE("Калькуляторы производства", "Production calculators"),
    summary: RE(
      "Переключайтесь между производством в facility, на фабрике и в refinery. Расчёты основаны на рецептах, а не на игровых остатках.",
      "Switch between facility, factory, and refinery production. Calculations use recipes, not live in-game stock.",
    ),
    shots: [
      {
        id: "facility",
        path: "/?tab=tools&tool=facility",
        mode: "viewport",
        prepare: "filterFacility",
        caption: RE("План производства в facility", "Facility production plan"),
        notes: [
          { sel: g("facility-search"), note: RE("Найдите предмет, чтобы открыть доступные производственные цепочки.", "Search for an item to see the available production chains.") },
          { sel: ".factory-item-card", note: RE("Карточка добавляет предмет в план и показывает его рецепт.", "A card adds an item to the plan and shows its recipe.") },
        ],
      },
      {
        id: "facility-power",
        path: "/?tab=tools&tool=facility",
        mode: { clip: g("facility-buildings") },
        prepare: "selectFacilityChain",
        caption: RE("Постройки производственной цепочки", "Buildings in the production chain"),
        notes: [
          { sel: g("facility-buildings"), note: RE("Здесь показаны постройки, где производятся выбранный предмет и его промежуточные материалы.", "This lists the buildings that produce the selected item and its intermediate materials.") },
        ],
      },
      {
        id: "factory",
        path: "/?tab=tools&tool=factory",
        mode: "viewport",
        prepare: "addFactoryItem",
        caption: RE("Очередь фабрики", "Factory queue"),
        notes: [
          { sel: ".factory-item-card", note: RE("Нажмите карточку предмета, чтобы добавить его в производственную очередь.", "Select an item card to add it to the production queue.") },
          { sel: ".factory-plan-row", note: RE("Измените число ящиков и проверьте расчёт ресурсов и времени справа.", "Adjust the crate count and review the resource and time totals on the right.") },
        ],
      },
      {
        id: "refinery",
        path: "/?tab=tools&tool=refinery",
        mode: "viewport",
        caption: RE("Расчёт переработки ресурсов", "Resource refining"),
        notes: [
          { sel: ".factory-item-card", note: RE("Сравните выход переработки и добавьте нужный материал в план.", "Compare refining output and add the needed material to the plan.") },
          { sel: ".factory-count", note: RE("Счётчик показывает число доступных рецептов и источник данных.", "The counter shows the available recipe count and data source.") },
        ],
      },
    ],
  },
  {
    key: "statistics",
    icon: "stats",
    title: RE("Статистика клана", "Clan statistics"),
    summary: RE(
      "Смотрите сводные показатели клана и ход командных целей. Доступность отдельных отчётов зависит от роли.",
      "Review clan summaries and team goals. Individual reports depend on your role.",
    ),
    shots: [
      {
        id: "statistics",
        path: "/?tab=clan&view=stats",
        mode: "viewport",
        caption: RE("Сводка активности и целей", "Activity and goals overview"),
        notes: [
          { sel: ".stats-kpis", note: RE("Ключевые показатели собраны в одном месте.", "Key metrics are collected in one place.") },
          { sel: "main", note: RE("Переключайте доступные отчёты и проверяйте период данных.", "Switch between available reports and check the data period.") },
        ],
      },
    ],
  },
  {
    key: "operations",
    icon: "alarm",
    title: RE("Операции", "Operations"),
    summary: RE(
      "Создавайте план операции, назначайте участников и связывайте логистические этапы с заказами и планированием карты.",
      "Create an operation plan, assign participants, and connect logistics steps with orders and map planning.",
    ),
    shots: [
      {
        id: "operations",
        path: "/?tab=clan&view=operations",
        mode: "viewport",
        caption: RE("Планы операций и участники", "Operation plans and participants"),
        notes: [
          { sel: "main", note: RE("Откройте план, чтобы увидеть задачи, время и состав группы.", "Open a plan to review its tasks, timing, and participants.") },
        ],
      },
    ],
  },
  {
    key: "feedback",
    icon: "feedback",
    title: RE("Обратная связь", "Feedback"),
    summary: RE(
      "Передайте разработчику описание проблемы или предложения. Не прикладывайте пароли и приватные ключи.",
      "Send the developer a bug report or suggestion. Do not include passwords or private keys.",
    ),
    shots: [
      {
        id: "feedback",
        path: "/?tab=feedback",
        mode: "viewport",
        caption: RE("Форма и история обращений", "Feedback form and history"),
        notes: [
          { sel: g("feedback-form"), note: RE("Опишите, что произошло, и приложите шаги для воспроизведения.", "Describe what happened and include steps to reproduce it.") },
        ],
      },
    ],
  },
  {
    key: "mail",
    icon: "mail",
    title: RE("Почта", "Mail"),
    summary: RE(
      "Внутренние сообщения показывают ответы разработчика и уведомления по операциям.",
      "Internal messages collect developer replies and operation notifications.",
    ),
    shots: [
      {
        id: "mail",
        path: "/?tab=mail",
        mode: "viewport",
        caption: RE("Входящие сообщения", "Inbox"),
        notes: [
          { sel: "main", note: RE("Откройте сообщение, чтобы прочитать его и отметить как прочитанное.", "Open a message to read it and mark it as read.") },
        ],
      },
    ],
  },
  {
    key: "support",
    icon: "support",
    title: RE("Поддержать проект", "Support the project"),
    summary: RE(
      "Раздел содержит способы поддержать разработку Sandalis и поддерживать работу сервиса.",
      "This section explains ways to support Sandalis development and keep the service running.",
    ),
    shots: [
      {
        id: "support",
        path: "/?tab=support",
        mode: "viewport",
        caption: RE("Поддержка Sandalis", "Support Sandalis"),
        notes: [
          { sel: "main", note: RE("Выберите удобный способ поддержки; условия указаны на странице.", "Choose a support option; its terms are listed on the page.") },
        ],
      },
    ],
  },
];
