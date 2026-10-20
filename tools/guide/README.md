# Генератор руководства «Навигация»

Снимает интерфейс терминала на демо-клане (ru/en/cs), считает координаты меток по
атрибутам `data-guide` и пишет:

* `backend/static/guide/<locale>/<shot>.webp` — скриншоты;
* `backend/app/seed/data/guide.json` — главы, подписи, метки, пояснения (сид всегда
  перезаписывает `app_content kind=guide_chapter`).

Тексты и что снимать — `chapters.mjs`, демо-данные — `demo.mjs`.

## Запуск (Windows)

1. Чистая БД и сид (контейнер `sandalis-test-pg` на 55432):

   ```bash
   docker exec sandalis-test-pg sh -c "dropdb -U postgres --if-exists sandalis_guide && createdb -U postgres sandalis_guide"
   cd backend
   JWT_SECRET=local-dev-secret DATABASE_URL=postgresql+asyncpg://postgres:postgres@127.0.0.1:55432/sandalis_guide .venv/Scripts/python.exe -m alembic upgrade head
   JWT_SECRET=local-dev-secret DATABASE_URL=postgresql+asyncpg://postgres:postgres@127.0.0.1:55432/sandalis_guide .venv/Scripts/python.exe -m app.seed
   ```

2. Бэкенд на 8020 с этой БД (`DEFAULT_CLAN_ID=SANDALIS`, `JWT_SECRET=local-dev-secret`,
   `COOKIE_SECURE=false`) — конфигурация `backend-guide` в `.claude/launch.json`.

3. Фронтенд — production-сборка (dev-сервер пересобирается на лету и подвешивает снимки):

   ```bash
   cd frontend
   BACKEND_URL=http://127.0.0.1:8020 npx next build
   npx next start --port 3300
   ```

4. Демо-клан и привязка Discord-сервера (для снимка выбора сервера):

   ```bash
   cd tools/guide && npm install && node demo.mjs
   docker exec sandalis-test-pg psql -U postgres -d sandalis_guide -c "update clans set discord_guild_id='900000000000000001', name='SINDARIS' where id='SANDALIS';"
   ```

5. Съёмка — из PowerShell (из Git Bash Edge не стартует):

   ```powershell
   cd tools/guide; node generate.mjs
   ```

   Переменные: `GUIDE_FRONTEND`, `GUIDE_BACKEND`, `GUIDE_JWT_SECRET`, `GUIDE_BROWSER`
   (по умолчанию Edge). При ошибке рядом сохраняется `debug-<locale>-<shot>.png`.

6. Закоммитить `backend/static/guide` и `guide.json` — на проде сид загрузит руководство
   при следующем деплое.

## Новая метка

Добавьте `data-guide="<id>"` элементу в компоненте и строку в `markers` нужного снимка
в `chapters.mjs` (`sel` — CSS-селектор; `"<css> >>N"` — N-й найденный элемент;
`at: "start"` — метка в левом верхнем углу крупного блока).
