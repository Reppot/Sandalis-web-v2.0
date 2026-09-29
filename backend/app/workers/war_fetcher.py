import asyncio

from app.core.db import SessionLocal
from app.services import war_service

INTERVAL = 60 * 5


async def tick() -> None:
    async with SessionLocal() as session:
        await war_service.refresh_regions(session)


def run() -> None:
    while True:
        asyncio.run(tick())
        asyncio.run(asyncio.sleep(INTERVAL))
