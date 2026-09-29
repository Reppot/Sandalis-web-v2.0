from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    frontend_url: str = "http://localhost:3000"

    session_ttl_min: int = 30          # как сегодня в .env.example
    access_tokens_json: str = "[]"     # реестр токенов → discord_id

    discord_client_id: str
    discord_client_secret: str
    discord_guild_id: str


settings = Settings()  # импортируется отовсюду одним объектом
