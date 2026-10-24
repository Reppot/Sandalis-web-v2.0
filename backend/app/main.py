from __future__ import annotations

import logging
import mimetypes
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.db import dispose_engine, warmup
from app.core.errors import register_exception_handlers
from app.core.i18n import Translator, load_catalogs, normalize_locale, parse_accept_language

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    load_catalogs()      # поднять все app/domain/*/locales/*.json в память (~КБ)
    await warmup()       # прогреть один коннект к Supabase
    yield
    await dispose_engine()


app = FastAPI(
    title="Sandalis API",
    version="2.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization", "X-Clan-Token", "X-Locale", "Accept-Language"],
    expose_headers=["Content-Language"],
)


@app.middleware("http")
async def locale_middleware(request: Request, call_next) -> Response:
    """
    Дублирует Depends(get_translator) на уровне ASGI: нужно, чтобы exception
    handler мог локализовать ошибку, даже если упали ДО резолва зависимостей.
    """
    locale = normalize_locale(request.headers.get("X-Locale")) or parse_accept_language(
        request.headers.get("Accept-Language")
    )
    request.state.locale = locale
    request.state.translator = Translator(locale=locale)
    response: Response = await call_next(request)
    response.headers.setdefault("Content-Language", locale)
    # API и /assets отдаются через прокси Next без его заголовков — базовые ставим здесь
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response


register_exception_handlers(app)
app.include_router(api_router, prefix=settings.API_V1_PREFIX)

# Иконки предметов, фоны разделов, логотип — файлы лежат в репозитории (backend/static),
# ссылки на них хранятся в БД (catalog_items.icon_url, app_content). Видео в git не кладём:
# его URL (Supabase Storage) тоже в app_content.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


# slim-образ Python не знает .webp/.svg: иначе иконки и скриншоты руководства
# уходят как application/octet-stream
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")


class CachedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers.setdefault("Cache-Control", "public, max-age=604800")
        return response


if STATIC_DIR.is_dir():
    app.mount(
        f"{settings.API_V1_PREFIX}/assets",
        CachedStaticFiles(directory=STATIC_DIR),
        name="assets",
    )
