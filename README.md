# SINDARIS Terminal v2.0

> Клановый инструмент логистики и управления для игры Foxhole.
> Версия 2.0: Полная пересборка из монолита в FSD-монорепозиторий (Next.js 15 + FastAPI + PostgreSQL).

[![Render](https://img.shields.io/badge/deploy-render.com-blue)](https://render.com)
[![Python](https://img.shields.io/badge/python-3.12-3776AB)]()
[![Next.js](https://img.shields.io/badge/next.js-15-000000)]()

---

## 🏗 Подробная структура проекта

Проект организован как **монорепозиторий**, разделенный на изолированные зоны. Ни один модуль не лезет в зону ответственности другого.

### 1. Frontend (`/frontend`)
Современное веб-приложение на Next.js 15 (App Router), React 19 и Tailwind CSS 4. Архитектура построена по упрощенной методологии FSD (Feature-Sliced Design).

*   **`src/app/`** — Каркас Next.js.
    *   `layout.tsx`, `page.tsx` — единственная точка входа, терминал с переключением вкладок.
    *   `globals.css` — базовые стили и кастомные скроллбары.
*   **`src/features/`** — 6 бизнес-модулей (каждый содержит слои `api`, `model`, `lib`, `ui`). Фичи **не импортируют** друг друга:
    *   `orders/` — логистика, очередь заявок на производство, статусы.
    *   `stockpiles/` — учет складов, скрытие кодов доступа под шторкой.
    *   `timers/` — контроль 48-часовой деградации резервов клана.
    *   `codes/` — поисковик по базе сокращений предметов (exact-match и подстроки).
    *   `production/` — калькулятор MPF (фабрик массового производства) со скидками до 50%.
    *   `cabinet/` — авторизация по клановым токенам, профиль Discord, управление сессией.
*   **`src/entities/`** — Доменные типы. Здесь лежат TypeScript-интерфейсы (`Item`, `Order`, `Session`), которые используют фичи.
*   **`src/shared/`** — Общий код и UI-кит.
    *   `api/client.ts` — единый HTTP-клиент, автоматически прокидывающий httpOnly cookie сессии.
    *   `ui/` — переиспользуемые Tailwind-компоненты (`Button`, `Card`, `Modal`, `Input`).
*   **Конфиги:**
    *   `next.config.ts` — настройки сборки, проксирование `/api` запросов к бэкенду.
    *   `tailwind.config.ts` — дизайн-система SINDARIS (цвета `sindaris-bg`, `sindaris-accent`).

### 2. Backend (`/backend`)
Асинхронный API-сервер на Python 3.12, FastAPI, SQLAlchemy 2 и Pydantic.

*   **`app/core/`** — Сердце системы:
    *   `config.py` — чтение `.env` переменных.
    *   `db.py` — асинхронный движок PostgreSQL (asyncpg).
    *   `security.py` — генерация токенов, парсинг реестра `ACCESS_TOKENS_JSON`.
*   **`app/domain/`** — Чистая бизнес-логика (0 зависимостей от сети или БД):
    *   `catalog/`, `production/`, `timers/` — алгоритмы расчетов и поиска.
*   **`app/models/`** — ORM модели таблиц базы данных (SQLAlchemy Declarative Base).
*   **`app/schemas/`** — DTO (Pydantic). Валидация JSON-запросов и сериализация ответов.
*   **`app/services/`** — Сервисный слой. Вся работа с БД (SELECT, INSERT, UPDATE) происходит здесь, а не в роутерах.
*   **`app/api/v1/`** — HTTP-роутеры FastAPI. Только принимают запрос, вызывают сервис, отдают ответ.
*   **`app/workers/`** — Фоновые задачи: конвертация видео (ffmpeg) и парсинг API войны Foxhole.
*   **`alembic/`** — Управление миграциями БД. Файл `versions/0001_initial_schema.py` создает все 9 таблиц.
*   **`scripts/`** — Скрипты одноразовой миграции данных (Supabase -> Postgres -> S3).
*   **`tests/`** — Юнит-тесты на pytest.

### 3. Инфраструктура и Документация (`/infra` и `/docs`)
*   `infra/render.yaml` — Blueprint для развертывания всего кластера на render.com одной кнопкой.
*   `infra/docker-compose.yml` — Файл для поднятия локальной базы данных.
*   `infra/Dockerfile.api` и `Dockerfile.web` — оптимизированные продакшен-образы контейнеров.
*   `docs/openapi.yaml` — Спецификация контракта API (Source of Truth).
*   `docs/decisions/` — Архитектурные журналы (ADR), объясняющие *почему* система спроектирована именно так.

---

## 🚀 Как запустить проект локально

### 1. Подготовка окружения
Убедитесь, что у вас установлены:
- Node.js v20+
- Python 3.12+
- Docker Desktop (запущенный)
- Git

### 2. Запуск Базы Данных (PostgreSQL)
```bash
cd infra
docker compose up -d
База поднимется на порту 5432. Пользователь: sandalis, пароль: sandalis.

3. Запуск Бэкенда
Откройте новый терминал и выполните:

Bash

cd backend
python -m venv .venv

# Активация виртуального окружения:
# Для Windows:
.venv\Scripts\activate
# Для Mac/Linux:
source .venv/bin/activate

# Установка зависимостей
pip install -e ".[dev]"

# Накатываем миграции (создаем таблицы)
alembic upgrade head

# Устанавливаем тестовый клановый токен для локальной разработки
# (В Windows CMD):
set ACCESS_TOKENS_JSON={"DEV_TOKEN":{"discord_id":"1000","role":"admin","username":"DevAdmin"}}
# (В PowerShell):
$env:ACCESS_TOKENS_JSON='{"DEV_TOKEN":{"discord_id":"1000","role":"admin","username":"DevAdmin"}}'

# Запуск сервера
uvicorn app.main:app --reload --port 8000
API будет доступно по адресу http://localhost:8000.
Интерактивная документация (Swagger): http://localhost:8000/api/docs.

4. Запуск Фронтенда
Откройте еще один терминал:

Bash

cd frontend
npm install
npm run dev
Приложение откроется по адресу http://localhost:3000. При входе используйте токен DEV_TOKEN.

☁️ Инструкции по миграции (Supabase -> Render + S3)
Старый проект использовал Supabase (DB + Storage). В версии 2.0 мы от него отказываемся в пользу чистого PostgreSQL на Render и S3 (Cloudflare R2 / AWS). Не удаляйте проект в Supabase, пока не выполните эти шаги на боевом сервере!

Шаг 1: Перенос таблиц (PostgreSQL)
Скрипт переносит пользователей, сессии, заказы, склады и таймеры.

Найдите строку подключения (Connection String) к базе данных в настройках Supabase (обязательно с пулером, порт 6543).
Запустите в терминале с активированным venv бэкенда:
Bash

set SOURCE_DB_URL=postgresql+asyncpg://postgres.xxxx:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
set DATABASE_URL=postgresql+asyncpg://sandalis:sandalis@localhost:5432/sandalis
python -m scripts.migrate_from_supabase
Шаг 2: Создание и объединение каталога
Берем старые файлы из прошлого репозитория и собираем их в БД v2.0:

Bash

python -m scripts.import_catalog --catalog ../old-project/data/catalog.json --hdf5 ../old-project/data/fs_vanilla.h5
Шаг 3: Перенос медиа в S3
Создайте бакет в Cloudflare R2 (или Backblaze B2), получите ключи.
Иконки (378 webp файлов):

Bash

set S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
set S3_ACCESS_KEY=your_access_key
set S3_SECRET_KEY=your_secret_key
set S3_BUCKET=sandalis-media
python -m scripts.import_icons_to_s3 --source ../old-project/public/FoxholeWikiPhotos
Видео из Supabase Storage:

Bash

set SUPABASE_VIDEO_URL=https://<your-supabase-id>.supabase.co/storage/v1/object/public/videos/intro.mp4
python -m scripts.migrate_video_to_s3 --key intro/main.mp4
После успешного выполнения всех 3 шагов и проверки, проект в Supabase можно удалить.

🚀 Деплой в Production (Render.com)
Деплой полностью автоматизирован через механизм Blueprints.

Зайдите в панель Render.com.
Нажмите New -> Blueprint.
Подключите ваш GitHub репозиторий Sandalis-web-v2.0.
Render автоматически прочитает файл infra/render.yaml и предложит создать 4 сервиса:
Базу данных PostgreSQL.
Web Service (API).
Web Service (Frontend).
Background Worker.
Заполните переменные окружения, которые запросит Render:
ACCESS_TOKENS_JSON (Ваш боевой JSON-реестр ключей).
S3_... ключи от бакета с иконками.
Нажмите Apply. Все сервисы соберутся и свяжутся друг с другом (Бэкенд получит DATABASE_URL, Фронт получит ссылку на Бэкенд).
💻 Справочник команд (Шпаргалка)
Работа с Git (Сохранение изменений)
Bash

git add .
git status                         # Проверить, какие файлы изменены
git commit -m "feat: описание"     # Создать коммит
git push                           # Отправить на GitHub
Frontend (npm)
Bash

npm run dev      # Запуск сервера разработки
npm run build    # Полная продакшен-сборка (проверка на ошибки)
npm run typecheck # Строгая проверка типов TypeScript (без сборки)
npm run lint     # Проверка кода линтером (ESLint)
Backend (Python)
Bash

uvicorn app.main:app --reload      # Запуск API-сервера
pytest -v                          # Запуск юнит-тестов
ruff check .                       # Проверка кода линтером (заменяет flake8/isort)
python -m app.workers              # Запуск фонового воркера (тестирование парсера)
База данных (Alembic)
Bash

alembic revision --autogenerate -m "Init" # Создать новую миграцию (если изменили app/models/)
alembic upgrade head                      # Накатить все новые миграции на БД
alembic downgrade -1                      # Откатить БД на один шаг назад
Docker
Bash

docker compose up -d    # Поднять БД локально (фоном)
docker compose down     # Остановить и удалить локальную БД
docker compose logs -f  # Смотреть логи БД




