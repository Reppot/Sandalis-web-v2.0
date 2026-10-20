// Главы руководства «Навигация»: тексты (ru/en/cs) и что снимать.
// Метка ставится на элемент по CSS-селектору; номера меток = порядок в markers.
// mode: "viewport" — весь экран; { clip: "<css>" } — только элемент.

const L = (ru, en, cs) => ({ ru, en, cs });
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
        markers: [
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
        markers: [
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
        path: "/?tab=orders",
        mode: "viewport",
        caption: L("Главный экран", "Main screen", "Hlavní obrazovka"),
        markers: [
          { sel: g("shell-brand"), note: L("Герб и название терминала.", "Crest and terminal name.", "Erb a název terminálu.") },
          { sel: g("shell-ticker"), note: L("Бегущая строка: склады, которые скоро исчезнут (красный — меньше часа, оранжевый — меньше суток). Наведите курсор, чтобы остановить.", "Ticker: stockpiles about to expire (red — under an hour, orange — under a day). Hover to pause it.", "Běžící řádek: sklady, které brzy zmizí (červená — méně než hodina, oranžová — méně než den). Najetím ho zastavíte.") },
          { sel: g("shell-status"), note: L("Состояние связи с сервером, общий статус складов и время последней синхронизации.", "Server link status, overall stockpile status and the time of the last sync.", "Stav spojení se serverem, celkový stav skladů a čas poslední synchronizace.") },
          { sel: g("shell-nav"), note: L("Разделы терминала. Набор вкладок зависит от вашей роли в клане.", "Terminal sections. Which tabs you see depends on your clan role.", "Sekce terminálu. Které záložky vidíte, závisí na vaší roli v klanu.") },
          { sel: g("shell-collapse"), note: L("Свернуть или развернуть меню — останутся только иконки.", "Collapse or expand the menu — only icons stay visible.", "Sbalit nebo rozbalit menu — zůstanou jen ikony.") },
          { sel: g("shell-theme"), note: L("Ночная или упрощённая (светлая) тема.", "Night or simplified (light) theme.", "Noční nebo zjednodušený (světlý) motiv.") },
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
        path: "/?tab=orders",
        mode: { clip: g("stock-panel") },
        caption: L("Содержимое закреплённого склада", "Pinned stockpile contents", "Obsah připnutého skladu"),
        markers: [
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
        path: "/?tab=orders",
        mode: { clip: g("builder-panel") },
        prepare: "pickMatrixItem",
        caption: L("Конструктор заказа", "Order builder", "Konstruktor objednávky"),
        markers: [
          { sel: g("builder-pick"), note: L("Выбранный предмет — нажмите на него в матрице ниже.", "The selected item — click it in the matrix below.", "Vybraný předmět — klikněte na něj v matici níže.") },
          { sel: g("builder-qty"), note: L("Количество. Enter сразу добавляет строку.", "Quantity. Enter adds the line right away.", "Množství. Enter řádek rovnou přidá.") },
          { sel: g("builder-unit"), note: L("Единица: ящики или штуки.", "Unit: crates or pieces.", "Jednotka: bedny nebo kusy.") },
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
        path: "/?tab=reports",
        mode: { clip: "main" },
        prepare: "expandReport",
        caption: L("Рапорты штаба", "HQ reports", "Hlášení štábu"),
        markers: [
          { sel: g("reports-filters"), note: L("Фильтр: текущие, выполненные, отменённые или все.", "Filter: current, completed, cancelled or all.", "Filtr: aktuální, splněné, zrušené nebo vše.") },
          { sel: g("reports-search"), note: L("Поиск по названию рапорта или предмету.", "Search by report title or item.", "Hledání podle názvu hlášení nebo předmětu.") },
          { sel: g("report-card"), at: "start", note: L("Рапорт: нажмите на заголовок, чтобы раскрыть все строки.", "A report: click the title to expand all lines.", "Hlášení: kliknutím na nadpis rozbalíte všechny řádky.") },
          { sel: g("report-status"), note: L("Статус: открыт, в работе, выполнен, отменён.", "Status: open, in progress, done, cancelled.", "Stav: otevřené, v řešení, splněno, zrušeno.") },
          { sel: `${g("report-actions")} button`, note: L("Смена статуса — взять в работу, выполнить, отменить.", "Change the status — take on, complete, cancel.", "Změna stavu — převzít, splnit, zrušit.") },
          { sel: g("report-builder"), note: L("Загрузить строки рапорта в конструктор для правки или повтора.", "Load the report lines into the builder to edit or repeat it.", "Načíst řádky hlášení do konstruktoru k úpravě nebo opakování.") },
          { sel: g("report-discord"), note: L("Отправить рапорт картинкой в канал Discord (вебхук задаётся в кабинете).", "Post the report as an image to the Discord channel (the webhook is set in the profile).", "Poslat hlášení jako obrázek do kanálu Discord (webhook se nastavuje v profilu).") },
          { sel: `${g("report-card")} ${g("export-formats")}`, note: L("Выгрузка рапорта в TXT, XLSX, PNG или буфер.", "Export the report as TXT, XLSX, PNG or to the clipboard.", "Export hlášení do TXT, XLSX, PNG nebo schránky.") },
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
        path: "/?tab=timers",
        mode: { clip: "main" },
        caption: L("Матрица таймеров", "Timer matrix", "Matice časovačů"),
        markers: [
          { sel: g("timers-stats"), note: L("Сколько складов в зоне риска: меньше часа, меньше суток и в безопасности.", "How many stockpiles are at risk: under an hour, under a day and safe.", "Kolik skladů je v ohrožení: méně než hodina, méně než den a v bezpečí.") },
          { sel: g("timers-search"), note: L("Поиск по сектору или складу.", "Search by sector or stockpile.", "Hledání podle sektoru nebo skladu.") },
          { sel: g("timers-register"), note: L("Поставить новый склад на мониторинг: гекс, локация и стартовое время (офицеры).", "Start monitoring a new stockpile: hex, location and starting time (officers).", "Zahájit sledování nového skladu: hex, lokace a počáteční čas (důstojníci).") },
          { sel: ".timer-card", at: "start", note: L("Карточка склада: полоса показывает остаток от 48 часов, цвет — уровень риска.", "Stockpile card: the bar shows what is left of 48 hours, the colour shows the risk.", "Karta skladu: pruh ukazuje zbytek ze 48 hodin, barva míru rizika.") },
          { sel: g("timer-left"), note: L("Оставшееся время до исчезновения склада.", "Time left until the stockpile disappears.", "Zbývající čas do zmizení skladu.") },
          { sel: g("timer-manage"), note: L("Открыть канал связи склада: обновить таймер, журнал, снять с мониторинга.", "Open the stockpile channel: refresh the timer, log, stop monitoring.", "Otevřít kanál skladu: obnovit časovač, deník, ukončit sledování.") },
        ],
      },
      {
        id: "timer-modal",
        path: "/?tab=timers",
        mode: { clip: ".modal-panel" },
        prepare: "openTimer",
        caption: L("Канал связи склада", "Stockpile channel", "Komunikační kanál skladu"),
        markers: [
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
        path: "/?tab=codes",
        mode: "viewport",
        caption: L("Реестр кодов", "Code registry", "Registr kódů"),
        markers: [
          { sel: g("codes-stats"), note: L("Всего записей, сколько с иконкой и сколько требуют проверки.", "Total records, how many have an icon and how many need review.", "Celkem záznamů, kolik má ikonu a kolik je třeba ověřit.") },
          { sel: g("codes-search"), note: L("Поиск по коду, английскому или русскому названию.", "Search by code, English or Russian name.", "Hledání podle kódu, anglického nebo ruského názvu.") },
          { sel: g("codes-filters"), note: L("Фильтры по категории и фракции.", "Category and faction filters.", "Filtry podle kategorie a frakce.") },
          { sel: g("codes-review"), note: L("Показать только спорные записи.", "Show disputed records only.", "Zobrazit jen sporné záznamy.") },
          { sel: g("codes-copy"), note: L("Скопировать отфильтрованные строки (JSON) или скачать CSV.", "Copy the filtered lines (JSON) or download a CSV.", "Zkopírovat filtrované řádky (JSON) nebo stáhnout CSV.") },
          { sel: g("codes-compare"), note: L("Сравнить сырую выгрузку склада из игры с реестром: что распознано, что нет.", "Compare a raw in-game stockpile export with the registry: what is recognised and what is not.", "Porovnat surový výpis skladu ze hry s registrem: co je rozpoznáno a co ne.") },
          { sel: g("codes-table"), at: "start", note: L("Таблица реестра.", "The registry table.", "Tabulka registru.") },
        ],
      },
    ],
  },
  {
    key: "tools",
    icon: "tools",
    title: L("Инструменты: калькуляторы", "Tools: calculators", "Nástroje: kalkulačky"),
    summary: L(
      "Калькуляторы фабрики, MPF и молотка (Refinery) считают ресурсы, ящики и время по данным foxhole.wiki.gg. Ниже — проверенные внешние сервисы клана.",
      "The Factory, MPF and Refinery calculators work out resources, crates and time from foxhole.wiki.gg data. Trusted external clan services are listed below.",
      "Kalkulačky továrny, MPF a rafinerie počítají suroviny, bedny a čas podle dat foxhole.wiki.gg. Níže jsou ověřené externí služby klanu.",
    ),
    shots: [
      {
        id: "tools-tabs",
        path: "/?tab=tools",
        mode: { clip: g("tools-tabs") },
        prepare: "openMpf",
        caption: L("Выбор калькулятора", "Choosing a calculator", "Výběr kalkulačky"),
        markers: [
          { sel: `${g("tools-tabs")} [role=tab] >>0`, note: L("Калькулятор фабрики: очередь до 4 ящиков (техника — 5), цена без скидки.", "Factory calculator: queue up to 4 crates (vehicles — 5), full price.", "Kalkulačka továrny: fronta až 4 bedny (vozidla — 5), plná cena.") },
          { sel: `${g("tools-tabs")} [role=tab] >>1`, note: L("MPF: заказ 3–9 ящиков (техника и сооружения 3–5), скидка 10–50% на каждый следующий ящик.", "MPF: an order of 3–9 crates (vehicles and structures 3–5), 10–50% off every next crate.", "MPF: objednávka 3–9 beden (vozidla a stavby 3–5), sleva 10–50 % na každou další bednu.") },
          { sel: `${g("tools-tabs")} [role=tab] >>2`, note: L("Молоток (Refinery): сколько сырья и времени нужно на материалы.", "Refinery: how much raw material and time the materials need.", "Rafinerie: kolik suroviny a času je potřeba na materiály.") },
        ],
      },
      {
        id: "mpf",
        path: "/?tab=tools",
        mode: "viewport",
        prepare: "fillMpf",
        caption: L("Калькулятор MPF", "MPF calculator", "Kalkulačka MPF"),
        markers: [
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
    key: "training",
    icon: "training",
    title: L("Обучение", "Training", "Výcvik"),
    summary: L(
      "Учебные модули штаба: работа с терминалом, форматы отчётов сканера, правила таймеров. Новые модули появляются по мере готовности.",
      "HQ training modules: using the terminal, scanner report formats, timer rules. New modules appear as they are ready.",
      "Výcvikové moduly štábu: práce s terminálem, formáty výstupů skeneru, pravidla časovačů. Nové moduly přibývají postupně.",
    ),
    shots: [
      {
        id: "training",
        path: "/?tab=training",
        mode: "viewport",
        caption: L("Учебный центр", "Training center", "Výcvikové centrum"),
        markers: [
          { sel: ".progress-track", note: L("Сколько модулей уже доступно.", "How many modules are available.", "Kolik modulů je k dispozici.") },
          { sel: "article.panel-inner", at: "start", note: L("Доступный модуль — нажмите, чтобы раскрыть текст.", "An available module — click to open it.", "Dostupný modul — kliknutím ho otevřete.") },
          { sel: "article.opacity-80", at: "start", note: L("Модуль в разработке.", "A module in development.", "Modul ve vývoji.") },
        ],
      },
    ],
  },
  {
    key: "cabinet",
    icon: "cabinet",
    title: L("Личный кабинет и управление кланом", "Profile and clan management", "Profil a správa klanu"),
    summary: L(
      "Профиль, уровень доступа и права, язык интерфейса. Командир здесь же подтягивает роли Discord-сервера и назначает им уровни, а высокий уровень подключает канал Discord и выпускает токены для ботов.",
      "Profile, access level and rights, interface language. The commander pulls the Discord server roles and assigns their levels here; high level connects the Discord channel and issues bot tokens.",
      "Profil, úroveň přístupu a práva, jazyk rozhraní. Velitel tu načítá role Discord serveru a přiřazuje jim úrovně; vysoká úroveň připojuje kanál Discord a vydává tokeny pro boty.",
    ),
    shots: [
      {
        id: "profile",
        path: "/?tab=cabinet",
        mode: "viewport",
        caption: L("Профиль участника", "Member profile", "Profil člena"),
        markers: [
          { sel: ".cabinet-hero .cabinet-pill >>1", note: L("Ваш уровень в клане: командир, высокий, средний доступ или рядовой.", "Your clan level: commander, high, medium access or private.", "Vaše úroveň v klanu: velitel, vysoký, střední přístup nebo řadový.") },
          { sel: ".cabinet-logout", note: L("Выйти из терминала на этом устройстве.", "Sign out of the terminal on this device.", "Odhlásit se z terminálu na tomto zařízení.") },
          { sel: ".cabinet-grid .cabinet-card", at: "start", note: L("Данные участника: ID, позывной, клан и способ входа.", "Member details: ID, callsign, clan and sign-in method.", "Údaje člena: ID, volací znak, klan a způsob přihlášení.") },
          { sel: ".cabinet-roles", note: L("Права роли: что вам разрешено в терминале.", "Role rights: what you are allowed to do in the terminal.", "Práva role: co smíte v terminálu dělat.") },
        ],
      },
      {
        id: "language",
        path: "/?tab=cabinet",
        mode: { clip: g("cab-lang") },
        caption: L("Язык интерфейса", "Interface language", "Jazyk rozhraní"),
        markers: [
          { sel: `${g("cab-lang")} [role=radiogroup]`, note: L("Русский, English или Čeština. Выбор сохраняется в профиле, на этом языке приходят и сообщения сервера.", "Русский, English or Čeština. The choice is saved to your profile; server messages use it too.", "Русский, English nebo Čeština. Volba se uloží do profilu, v tomto jazyce chodí i zprávy serveru.") },
        ],
      },
      {
        id: "webhook",
        path: "/?tab=cabinet",
        mode: { clip: g("cab-webhook") },
        caption: L("Канал Discord для рапортов (высокий доступ)", "Discord channel for reports (high access)", "Kanál Discord pro hlášení (vysoký přístup)"),
        markers: [
          { sel: `${g("cab-webhook")} input`, note: L("URL вебхука канала: Discord → Настройки канала → Интеграции → Вебхуки → «Скопировать URL».", "Channel webhook URL: Discord → Channel settings → Integrations → Webhooks → “Copy Webhook URL”.", "URL webhooku kanálu: Discord → Nastavení kanálu → Integrace → Webhooky → „Kopírovat URL“.") },
          { sel: `${g("cab-webhook")} .btn-primary`, note: L("Сохранить. После этого в рапортах работает кнопка «В Discord».", "Save. After that the “To Discord” button works in reports.", "Uložit. Potom v hlášeních funguje tlačítko „Do Discordu“.") },
        ],
      },
      {
        id: "roles",
        path: "/?tab=cabinet",
        mode: { clip: g("cab-roles") },
        caption: L("Роли Discord (только командир)", "Discord roles (commander only)", "Role Discordu (jen velitel)"),
        markers: [
          { sel: `${g("cab-roles")} .btn-primary`, note: L("Добавить бота клана на сервер (без прав), затем «Подтянуть роли». Пока роли не подтянуты, вступить в клан нельзя.", "Add the clan bot to the server (no permissions), then “Pull roles”. Until roles are pulled nobody can join the clan.", "Přidejte bota klanu na server (bez oprávnění), pak „Načíst role“. Dokud role nejsou načteny, do klanu nelze vstoupit.") },
          { sel: `${g("cab-roles")} ul select`, note: L("Уровень доступа роли: базовый (рядовой, по умолчанию), средний или высокий. Участник получает самый высокий уровень среди своих ролей.", "Role access level: basic (private, default), medium or high. A member gets the highest level among their roles.", "Úroveň přístupu role: základní (řadový, výchozí), střední nebo vysoká. Člen dostane nejvyšší úroveň ze svých rolí.") },
          { sel: `${g("cab-roles")} .justify-end button`, note: L("Сохранить уровни. Участники получат их при следующем входе.", "Save the levels. Members get them at their next sign-in.", "Uložit úrovně. Členové je dostanou při dalším přihlášení.") },
          { sel: `${g("cab-roles")} .hud-label.text-accent`, note: L("Участники сервера: их роли, уровень и вступили ли они в терминал (нужен Server Members Intent у бота).", "Server members: their roles, level and whether they joined the terminal (needs the bot's Server Members Intent).", "Členové serveru: jejich role, úroveň a zda vstoupili do terminálu (bot potřebuje Server Members Intent).") },
        ],
      },
      {
        id: "token",
        path: "/?tab=cabinet",
        mode: { clip: g("cab-token") },
        caption: L("API-токен для бота (высокий доступ)", "API token for a bot (high access)", "API token pro bota (vysoký přístup)"),
        markers: [
          { sel: `${g("cab-token")} input`, note: L("Название токена, например «discord-bot».", "Token name, e.g. “discord-bot”.", "Název tokenu, např. „discord-bot“.") },
          { sel: `${g("cab-token")} select`, note: L("Роль бота — чаще всего «Гость (только чтение)».", "The bot's role — usually “Guest (read only)”.", "Role bota — nejčastěji „Host (jen čtení)“.") },
          { sel: `${g("cab-token")} .btn-primary`, note: L("Выпустить токен. Он показывается один раз — сохраните его.", "Issue the token. It is shown only once — save it.", "Vydat token. Zobrazí se jen jednou — uložte si ho.") },
        ],
      },
    ],
  },
];
