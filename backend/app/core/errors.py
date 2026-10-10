from __future__ import annotations

import logging
from typing import Any, ClassVar

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.i18n import Translator

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Базовая доменная ошибка: несёт ключ перевода, а не готовый текст."""

    status_code: ClassVar[int] = status.HTTP_400_BAD_REQUEST
    code: ClassVar[str] = "app_error"
    message_key: ClassVar[str] = "errors.internal"
    domain: ClassVar[str] = "core"

    def __init__(
        self,
        *,
        message_key: str | None = None,
        domain: str | None = None,
        params: dict[str, Any] | None = None,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        self.message_key = message_key or type(self).message_key
        self.domain = domain or type(self).domain
        self.params = params or {}
        self.status_code = status_code or type(self).status_code
        self.code = code or type(self).code
        super().__init__(f"{self.code}:{self.message_key}")

    def localize(self, translator: Translator) -> str:
        return translator.t(self.message_key, domain=self.domain, **self.params)


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    message_key = "errors.not_found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


class UnauthorizedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthorized"
    message_key = "errors.unauthorized"


class PermissionDeniedError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"
    message_key = "errors.forbidden"


class ClanContextMissingError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "clan_context_missing"
    message_key = "errors.clan_context_missing"


class ClanScopeViolationError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "clan_scope_violation"
    message_key = "errors.clan_scope_violation"


# --------------------------------------------------------------------------- #
def _translator(request: Request) -> Translator:
    tr = getattr(request.state, "translator", None)
    return tr if isinstance(tr, Translator) else Translator(locale=settings.DEFAULT_LOCALE)


def _envelope(code: str, message: str, locale: str, **extra: Any) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "locale": locale, **extra}}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        tr = _translator(request)
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(exc.code, exc.localize(tr), tr.locale, params=exc.params),
            headers={"Content-Language": tr.locale},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        tr = _translator(request)
        return JSONResponse(
            status_code=422,
            content=_envelope(
                "validation_error",
                tr.t("errors.validation"),
                tr.locale,
                fields=[
                    {"loc": list(e["loc"]), "type": e["type"], "msg": e["msg"]}
                    for e in exc.errors()
                ],
            ),
            headers={"Content-Language": tr.locale},
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        tr = _translator(request)
        # detail может быть ключом перевода вида "production:order.not_found"
        message = tr.t(exc.detail) if isinstance(exc.detail, str) else str(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(f"http_{exc.status_code}", message, tr.locale),
            headers={**(exc.headers or {}), "Content-Language": tr.locale},
        )

    @app.exception_handler(OperationalError)
    @app.exception_handler(DBAPIError)
    async def _db(request: Request, exc: DBAPIError) -> JSONResponse:
        tr = _translator(request)
        logger.exception("DB error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=_envelope("db_unavailable", tr.t("errors.db_unavailable"), tr.locale),
            headers={"Retry-After": "3", "Content-Language": tr.locale},
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        tr = _translator(request)
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content=_envelope("internal_error", tr.t("errors.internal"), tr.locale),
            headers={"Content-Language": tr.locale},
        )
