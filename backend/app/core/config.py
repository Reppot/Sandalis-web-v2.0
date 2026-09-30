from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+asyncpg://sandalis:sandalis@localhost:5432/sandalis"
    )

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    access_token: str = ""
    access_tokens_json: str = "{}"

    session_ttl_minutes: int = 30
    session_cookie_name: str = "sindaris_session"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    frontend_url: str = "http://localhost:3000"

    discord_client_id: str = ""
    discord_client_secret: str = ""
    discord_redirect_uri: str = (
        "http://localhost:8000/api/v1/auth/discord/callback"
    )
    discord_api_base_url: str = "https://discord.com/api/v10"
    oauth_state_ttl_seconds: int = 600
    oauth_state_cookie_name: str = "sindaris_oauth_state"

    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "sandalis-media"

    debug: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def async_database_url(self) -> str:
        """Преобразует URL Render/PostgreSQL в URL для asyncpg."""
        url = self.database_url.strip()

        if url.startswith("postgres://"):
            return "postgresql+asyncpg://" + url.removeprefix("postgres://")

        if url.startswith("postgresql://"):
            return "postgresql+asyncpg://" + url.removeprefix(
                "postgresql://"
            )

        return url


settings = Settings()