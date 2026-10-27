"""Discord Interactions: кнопки на постах заказов и слэш-команды бота.

Адрес вписывается в Developer Portal → General Information → Interactions Endpoint URL.
Discord подписывает каждый запрос (Ed25519); без верной подписи — 401, так требует Discord.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse

from app.api.deps import DbDep
from app.services import discord_bot, discord_interactions

router = APIRouter(prefix="/discord", tags=["discord"])


@router.post("/interactions", include_in_schema=False)
async def interactions(request: Request, session: DbDep, background: BackgroundTasks) -> Any:
    body = await request.body()
    if not discord_bot.verify(request.headers.get("X-Signature-Ed25519"), request.headers.get("X-Signature-Timestamp"), body):
        return JSONResponse({"error": "invalid request signature"}, status_code=401)
    return await discord_interactions.handle(session, json.loads(body), background)
