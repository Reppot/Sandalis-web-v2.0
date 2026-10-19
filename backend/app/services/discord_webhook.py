"""Отправка сообщений в текстовый канал Discord через вебхук клана.

URL вебхука — секрет клана (clan_settings), поэтому отправка идёт только с сервера:
клиент (веб/десктоп) не видит URL. HTTP-клиент берём из discord_oauth.get_http_client —
тесты подменяют его одним monkeypatch/respx на оба модуля.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.errors import AppError
from app.services import discord_oauth

EMBED_COLOR = 0xA3E635          # лаймовый акцент терминала
DESCRIPTION_LIMIT = 4096        # лимит Discord на description эмбеда
DOMAIN = "reports"


def _failed(code: str = "discord_failed") -> AppError:
    return AppError(
        message_key="report.discord_failed", domain=DOMAIN, code=code,
        status_code=502, params={},
    )


async def post_webhook(
    url: str,
    *,
    embed: dict[str, Any],
    image: tuple[str, bytes] | None = None,
    username: str = "SINDARIS Terminal",
) -> None:
    payload: dict[str, Any] = {"username": username, "embeds": [embed], "allowed_mentions": {"parse": []}}
    if image:
        filename, _ = image
        payload["embeds"][0]["image"] = {"url": f"attachment://{filename}"}
    try:
        async with discord_oauth.get_http_client() as client:
            if image:
                filename, data = image
                response = await client.post(
                    url,
                    data={"payload_json": json.dumps(payload, ensure_ascii=False)},
                    files={"files[0]": (filename, data, "image/png")},
                )
            else:
                response = await client.post(url, json=payload)
    except httpx.HTTPError as exc:
        raise _failed() from exc
    if response.status_code in (401, 404):
        # вебхук удалили или URL неверный — это настройка клана, а не сбой Discord
        raise AppError(
            message_key="report.discord_webhook_invalid", domain=DOMAIN,
            code="discord_webhook_invalid", status_code=409, params={},
        )
    if response.status_code >= 400:
        raise _failed()


def truncate_lines(lines: list[str], limit: int = DESCRIPTION_LIMIT) -> str:
    out: list[str] = []
    used = 0
    for index, line in enumerate(lines):
        rest = len(lines) - index
        tail = f"… +{rest}"
        if used + len(line) + 1 > limit - len(tail) - 1:
            out.append(tail)
            break
        out.append(line)
        used += len(line) + 1
    return "\n".join(out)
