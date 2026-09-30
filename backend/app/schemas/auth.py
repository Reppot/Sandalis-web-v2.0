from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import to_camel


class APIModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ClanTokenLoginRequest(APIModel):
    token: str = Field(min_length=1, max_length=512)


class DiscordProfileResponse(APIModel):
    id: str
    username: str
    discriminator: str = "0"
    avatar_url: str | None = None


class AuthSessionResponse(APIModel):
    token: str
    discord_id: str | None = None
    discord_profile: DiscordProfileResponse | None = None
    created_at: datetime
    expires_at: datetime
    role: str