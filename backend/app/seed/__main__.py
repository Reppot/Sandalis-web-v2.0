from __future__ import annotations

import asyncio
import logging

from app.core.db import engine
from app.seed import run

logging.basicConfig(level=logging.INFO, format="[seed] %(message)s")


async def main() -> None:
    async with engine.begin() as conn:
        stats = await run(conn)
    await engine.dispose()
    logging.info("catalog=%(catalog)s recipes=%(recipes)s content_inserted=%(content_inserted)s", stats)


if __name__ == "__main__":
    asyncio.run(main())
