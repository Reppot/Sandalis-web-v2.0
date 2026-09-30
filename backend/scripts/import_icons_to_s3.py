"""Загрузка всех 378 иконок из public/FoxholeWikiPhotos в S3 и обновление icon_url в БД.

Использование:
    python -m scripts.import_icons_to_s3 --source ../frontend/public/FoxholeWikiPhotos

Скрипт идемпотентен: пропускает уже загруженные файлы.
"""
import argparse
import asyncio
import logging
from pathlib import Path

from sqlalchemy import select, update

from app.core.db import async_session_factory
from app.models import Item
from app.services.s3_service import S3Service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("import_icons")


async def upload_icons(source_dir: Path) -> tuple[int, int]:
    """Загружает все webp-иконки в S3, обновляет icon_url в items."""
    if not source_dir.exists():
        logger.error("Source directory not found: %s", source_dir)
        return 0, 0

    s3 = S3Service()

    uploaded = 0
    skipped = 0
    url_map: dict[str, str] = {}  # filename → public URL

    for icon_path in source_dir.glob("*.webp"):
        s3_key = f"icons/foxhole/{icon_path.name}"

        if s3.key_exists(s3_key):
            skipped += 1
        else:
            s3.upload_file(icon_path, s3_key, content_type="image/webp")
            uploaded += 1
            if uploaded % 25 == 0:
                logger.info("Uploaded %d icons...", uploaded)

        url_map[icon_path.name] = f"{s3.client.meta.endpoint_url}/{s3.bucket}/{s3_key}"

    logger.info("S3 upload complete: %d new, %d already existed", uploaded, skipped)

    # Обновляем icon_url в таблице items
    async with async_session_factory() as db:
        try:
            all_items = (await db.execute(select(Item))).scalars().all()
            updated = 0

            for item in all_items:
                if not item.icon_url:
                    continue
                filename = Path(item.icon_url).name
                if filename in url_map:
                    await db.execute(
                        update(Item).where(Item.id == item.id).values(icon_url=url_map[filename])
                    )
                    updated += 1

            await db.commit()
            logger.info("Updated icon_url for %d items", updated)
        except Exception as e:
            await db.rollback()
            logger.exception("Failed to update icon_url: %s", e)
            raise

    return uploaded, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload Foxhole icons to S3")
    parser.add_argument(
        "--source",
        type=Path,
        required=True,
        help="Directory with .webp icons (typically public/FoxholeWikiPhotos)",
    )
    args = parser.parse_args()

    asyncio.run(upload_icons(args.source))


if __name__ == "__main__":
    main()