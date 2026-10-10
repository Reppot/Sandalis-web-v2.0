from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", case_sensitive=False
    )

    ENV: Literal["local", "staging", "prod"] = "local"
    API_V1_PREFIX: str = "/api/v1"

    # --- DB -------------------------------------------------------------
    DATABASE_URL: str                      # postgresql+asyncpg://...
    DB_USE_PGBOUNCER: bool = False         # True для Supabase pooler (порт 6543)
    DB_POOL_SIZE: int = 3
    DB_MAX_OVERFLOW: int = 2
    DB_POOL_RECYCLE: int = 1800
    DB_POOL_TIMEOUT: int = 10
    DB_CONNECT_TIMEOUT: int = 10
    DB_COMMAND_TIMEOUT: int = 30
    SQL_ECHO: bool = False

    # --- Auth -----------------------------------------------------------
    JWT_SECRET: str
    JWT_ALG: str = "HS256"
    JWT_ISSUER: str = "sandalis"
    JWT_AUDIENCE: str = "sandalis-web"
    ACCESS_TOKEN_TTL_MIN: int = 60
    SESSION_COOKIE_NAME: str = "sandalis_session"
    CLAN_TOKEN_HEADER: str = "X-Clan-Token"

    # --- i18n -----------------------------------------------------------
    DEFAULT_LOCALE: str = "en"
    SUPPORTED_LOCALES: tuple[str, ...] = ("ru", "en", "cs")
    I18N_HOT_RELOAD: bool = Field(default=False)  # True только локально


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
