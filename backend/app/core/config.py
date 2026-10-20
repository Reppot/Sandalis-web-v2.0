from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.permissions import ClanRole


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

    # Dev/админ-выдача JWT («служебный ключ»). Задан + совпал c X-Dev-Auth-Key
    # -> выдача разрешена даже в prod. Не задан -> только ENV != prod.
    DEV_AUTH_SECRET: str | None = None
    DEV_AUTH_HEADER: str = "X-Dev-Auth-Key"

    # --- OAuth / Discord ------------------------------------------------
    # Пустые CLIENT_ID/CLIENT_SECRET -> /auth/discord/login отвечает 503
    # «discord.disabled» (фича выключена, а не сломана).
    DISCORD_API_BASE_URL: str = "https://discord.com/api/v10"
    DISCORD_AUTHORIZE_URL: str = "https://discord.com/oauth2/authorize"
    DISCORD_CLIENT_ID: str = ""
    DISCORD_CLIENT_SECRET: str = ""
    DISCORD_REDIRECT_URI: str = ""
    DISCORD_OAUTH_STATE_TTL_SEC: int = 600   # срок жизни подписанного state

    # --- Frontend / session-cookie --------------------------------------
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    SESSION_TTL_MINUTES: int = 60            # Max-Age куки = TTL * 60
    COOKIE_SECURE: bool = False              # в prod -> true
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"

    # --- Bootstrap-аренда ------------------------------------------------
    # Основной клан сайта: его данные видит гостевой доступ (GUEST_CLAN_ID пуст)
    # и его admin+ правят глобальный контент. Discord-юзеров сюда больше НЕ
    # принимают автоматически: владелец сервера создаёт клан сам, остальные
    # вступают по invite-ссылке.
    DEFAULT_CLAN_ID: str | None = None
    DEFAULT_CLAN_ROLE: ClanRole = ClanRole.GUEST   # устарело: авто-вступление отключено
    # Гостевой доступ «только просмотр» (POST /auth/guest). Пусто -> DEFAULT_CLAN_ID;
    # оба пусты -> гостевой вход выключен.
    GUEST_CLAN_ID: str | None = None
    GUEST_TOKEN_TTL_MIN: int = 720
    # Сколько живёт выбор сервера после Discord-входа (подписанная кука).
    DISCORD_SETUP_TTL_SEC: int = 900
    # Глобальный контент (видео входа, ссылки, обучение) правят admin+ только этого
    # клана. Пусто -> DEFAULT_CLAN_ID.
    CONTENT_ADMIN_CLAN_ID: str | None = None

    # --- i18n -----------------------------------------------------------
    DEFAULT_LOCALE: str = "en"
    SUPPORTED_LOCALES: tuple[str, ...] = ("ru", "en", "cs")
    I18N_HOT_RELOAD: bool = Field(default=False)  # True только локально


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
