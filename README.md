# SINDARIS Terminal v2.0

> Полная пересборка кланового инструмента Foxhole из монолита в монорепозиторий.

[![Render](https://img.shields.io/badge/deploy-render.com-blue)](https://render.com)
[![Python](https://img.shields.io/badge/python-3.12-3776AB)]()
[![Next.js](https://img.shields.io/badge/next.js-15-000000)]()

---

## Что это

**SINDARIS Terminal** — веб-приложение для управления кланом в Foxhole:

| Модуль | Назначение |
|--------|-----------|
| **Заказы** | Очередь заявок на производство и логистику |
| **Склады** | Учёт клановых запасов, секретные коды складов |
| **Таймеры** | Контроль 48-часовой деградации резервов |
| **База кодов** | Поиск сокращений и номенклатуры Foxhole |
| **Производство** | Калькулятор очередей MPF со скидками до 50% |
| **Кабинет** | Авторизация по клановому токену и Discord OAuth |

---

## Архитектура
sandalis/
├── frontend/ Next.js 15 · React 19 · Tailwind 4 · TypeScript strict
├── backend/ Python 3.12 · FastAPI · SQLAlchemy 2 · Pydantic v2
├── infra/ Docker Compose · render.yaml (Blueprint)
└── docs/ OpenAPI 3.1 · ADR

text


### Слои фронтенда (FSD-подобная архитектура)
src/
├── app/ Маршруты и компоновка страниц
├── features/ 6 изолированных модулей (orders, stockpiles, timers, codes, production, cabinet)
├── entities/ Доменные типы (session, item, order, stockpile)
└── shared/ UI-кит, API-клиент, утилиты, конфиг

text


### Слои бэкенда
app/
├── api/v1/ HTTP-роутеры (auth, orders, stockpiles, timers, items)
├── services/ Бизнес-логика + SQLAlchemy
├── domain/ Чистый Python (каталог, MPF-калькулятор, таймеры)
├── models/ ORM-модели (9 таблиц)
├── schemas/ Pydantic v2 DTO
├── workers/ Фоновые задачи (ffmpeg, импорт данных войны)
└── core/ Конфиг, БД, безопасность

text


---

## Быстрый старт

### Требования
- **Node.js** 20+ и **npm**
- **Python** 3.12+
- **Docker Desktop** (для PostgreSQL)
- **Git**

### 1. Клонирование
```bash
git clone https://github.com/Reppot/Sandalis-web-v2.0.git
cd Sandalis-web-v2.0
2. База данных
Bash

cd infra
docker compose up db -d
3. Бэкенд
Bash

cd ../backend
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

pip install -e ".[dev]"
alembic upgrade head

# Тестовый клан-токен для разработки:
set ACCESS_TOKENS_JSON={"DEV_TOKEN":{"discord_id":"1000","role":"admin","username":"DevAdmin"}}

uvicorn app.main:app --reload --port 8000
API доступно на http://localhost:8000, Swagger: http://localhost:8000/api/docs

4. Фронтенд (в отдельном терминале)
Bash

cd frontend
npm install
npm run dev
Откройте http://localhost:3000 — терминал SINDARIS.

5. Проверка
Bash

# Тесты бэкенда:
cd backend && pytest -v

# Сборка фронтенда:
cd frontend && npm run build
Деплой на render.com
Подключите репозиторий в render.com → Blueprints → New Blueprint Instance.
Укажите infra/render.yaml.
Заполните переменные окружения (отмечены sync: false в render.yaml):
ACCESS_TOKENS_JSON — реестр клановых токенов
DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI
S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY
Нажмите Apply. Render поднимет PostgreSQL, API, Frontend и Worker автоматически.
Стек
Слой	Технологии
Frontend	Next.js 15, React 19, TypeScript strict, Tailwind CSS 4
Backend	Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2
База	PostgreSQL 16
Файлы	S3-совместимое хранилище (Cloudflare R2 / Backblaze B2)
Авторизация	Клановые токены + Discord OAuth → httpOnly-cookie sindaris_session
Контракт	OpenAPI 3.1 (docs/openapi.yaml)
Деплой	render.com Blueprint, Docker Compose локально
Статус итераций
 Итерация 1 — Каркас монорепозитория, конфиги, healthcheck
 Итерация 2 — Shared (UI-кит, API-клиент) и Entities
 Итерация 3 — 6 фич фронтенда (orders, stockpiles, timers, codes, production, cabinet)
 Итерация 4 — Core и Domain бэкенда, модели, unit-тесты
 Итерация 5 — API v1, сервисы, воркеры, Alembic-миграции
 Итерация 6 — Скрипты миграции данных, чистка git
 Итерация 7 — Инфраструктура, OpenAPI, финальная сверка
Документация
docs/openapi.yaml — HTTP-контракт API
docs/decisions/ — журнал архитектурных решений (ADR)
Лицензия
Приватный проект клана. Все права защищены.