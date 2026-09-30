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

## Запуск backend локально

### Требования

- Python `3.12.x`
- PostgreSQL
- Git
- Node.js / npm — для frontend

---

## Backend

Перейдите в папку backend:

```bash
cd backend
Создайте и активируйте виртуальное окружение:

Windows CMD
cmd

python -m venv .venv
.venv\Scripts\activate
Установите зависимости:

cmd

pip install -r requirements.txt
Важные исправления для корректного запуска
Если проект был скачан из репозитория и при запуске появляются ошибки импортов или миграций, проверьте следующие моменты.

1. Наличие __init__.py
В backend должны существовать файлы __init__.py в основных пакетах:

cmd

type nul > app\__init__.py
type nul > app\api\__init__.py
type nul > app\api\v1\__init__.py
type nul > app\core\__init__.py
type nul > app\domain\__init__.py
type nul > app\domain\catalog\__init__.py
type nul > app\domain\production\__init__.py
type nul > app\domain\timers\__init__.py
type nul > tests\__init__.py
type nul > tests\core\__init__.py
type nul > tests\domain\__init__.py
2. Исправление схем заказов
В папке:

text

app/schemas
файл схем заказов должен называться:

text

orders.py
Если он называется order.py, переименуйте:

cmd

ren app\schemas\order.py orders.py
Также в файле:

text

app/schemas/__init__.py
импорт должен быть таким:

Python

from app.schemas.orders import (
    ...
)
3. Исправление модели складских заявок
Файл:

text

app/models/stockpile.py
должен содержать модели Stockpile и StockpileItem, а не копии Order / OrderItem.

Корректный вариант:

Python

import uuid

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Stockpile(TimestampMixin, Base):
    __tablename__ = "stockpiles"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    creator_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    assignee_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(32),
        default="pending",
        index=True,
        nullable=False,
    )

    destination: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    items: Mapped[list["StockpileItem"]] = relationship(
        "StockpileItem",
        back_populates="stockpile",
        cascade="all, delete-orphan",
    )


class StockpileItem(Base):
    __tablename__ = "stockpile_items"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    stockpile_id: Mapped[str] = mapped_column(
        ForeignKey("stockpiles.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    item_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    completed_quantity: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    stockpile: Mapped["Stockpile"] = relationship(
        "Stockpile",
        back_populates="items",
    )
4. Регистрация всех моделей для Alembic
Файл:

text

app/models/__init__.py
не должен быть пустым. Alembic должен видеть все модели проекта.

Пример содержимого:

Python

from app.models.base import Base, TimestampMixin
from app.models.item import Item
from app.models.order import Order, OrderItem
from app.models.session import Session
from app.models.stockpile import Stockpile, StockpileItem
from app.models.timer import Timer
from app.models.user import User

__all__ = [
    "Base",
    "TimestampMixin",
    "Item",
    "Order",
    "OrderItem",
    "Session",
    "Stockpile",
    "StockpileItem",
    "Timer",
    "User",
]
Если названия классов в ваших файлах отличаются, используйте фактические имена классов из соответствующих файлов моделей.

Проверка backend перед запуском
После исправлений выполните:

cmd

python -c "import app.main; print('main OK')"
Если всё настроено правильно, вывод будет:

text

main OK
Миграции базы данных
Примените существующие миграции:

cmd

alembic upgrade head
Если модели были исправлены или добавлены новые поля, можно синхронизировать миграции:

cmd

alembic revision --autogenerate -m "sync_all_models"
alembic upgrade head
После повторной автогенерации может появиться пустая миграция. Если в логах нет строк вида Detected added, Detected removed, Detected changed, такую пустую миграцию можно удалить из:

text

alembic/versions
Запуск backend
cmd

python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
После успешного запуска должно появиться:

text

Application startup complete.
Адреса backend
Swagger UI доступен по адресу:

text

http://127.0.0.1:8000/api/docs
OpenAPI JSON:

text

http://127.0.0.1:8000/api/openapi.json
Health check:

text

http://127.0.0.1:8000/api/health
Также есть root health endpoint:

text

http://127.0.0.1:8000/health
Важно: /docs может возвращать 404, так как документация в этом проекте находится по адресу /api/docs.

Frontend
В отдельном терминале перейдите в папку frontend:

cmd

cd frontend
Установите зависимости:

cmd

npm install
Запустите frontend:

cmd

npm run dev
Если frontend не видит backend, проверьте .env frontend-части. Обычно нужно указать один из вариантов:

env

VITE_API_URL=http://127.0.0.1:8000
или:

env

VITE_API_URL=http://127.0.0.1:8000/api
Зависит от того, как в коде frontend формируются API-запросы.

Частые ошибки
ModuleNotFoundError: No module named 'app.schemas.orders'
Проверьте, что файл называется:

text

app/schemas/orders.py
а не:

text

app/schemas/order.py
ImportError: cannot import name 'Base' from 'app.models'
Проверьте файл:

text

app/models/__init__.py
В нём должен импортироваться Base:

Python

from app.models.base import Base
sqlalchemy.exc.InvalidRequestError: Table 'orders' is already defined
Скорее всего, в одной из моделей случайно скопирован класс Order или OrderItem.

Проверьте:

text

app/models/stockpile.py
В нём должны быть классы:

Python

Stockpile
StockpileItem
а таблицы должны называться:

Python

__tablename__ = "stockpiles"
__tablename__ = "stockpile_items"
/docs возвращает 404
Это нормально для данного проекта. Используйте:

text

http://127.0.0.1:8000/api/docs


