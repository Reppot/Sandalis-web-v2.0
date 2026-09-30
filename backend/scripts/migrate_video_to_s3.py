"""Перенос видео из Supabase Storage в S3.

Использование:
    export SUPABASE_VIDEO_URL="https://xxx.supabase.co/storage/v1/object/public/videos/intro.mp4"
    python -m scripts.migrate_video_to_s3 --key intro/main.mp4

Скрипт скачивает файл во временную папку, загружает в S3 и печатает публичный URL.
"""
import argparse
import logging
import os
import sys
import tempfile
from pathlib import Path

import httpx

from app.services.s3_service import S3Service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("migrate_video")


def download_video(url: str, dest: Path) -> None:
    """Скачивает файл потоково без загрузки в память."""
    logger.info("Downloading %s", url)
    with httpx.stream("GET", url, timeout=300.0) as response:
        response.raise_for_status()
        with dest.open("wb") as f:
            for chunk in response.iter_bytes(chunk_size=8192):
                f.write(chunk)
    size_mb = dest.stat().st_size / (1024 * 1024)
    logger.info("Downloaded %.2f MB", size_mb)


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate video from Supabase Storage to S3")
    parser.add_argument("--key", type=str, required=True, help="S3 destination key (e.g. intro/main.mp4)")
    parser.add_argument("--url", type=str, default=None, help="Source URL (overrides SUPABASE_VIDEO_URL)")
    args = parser.parse_args()

    source_url = args.url or os.environ.get("SUPABASE_VIDEO_URL")
    if not source_url:
        logger.error("Source URL required: pass --url or set SUPABASE_VIDEO_URL")
        sys.exit(1)

    s3 = S3Service()

    if s3.key_exists(args.key):
        logger.warning("Key already exists in S3: %s", args.key)
        signed = s3.generate_signed_url(args.key, expires_in=86400)
        logger.info("Signed URL (24h): %s", signed)
        return

    with tempfile.TemporaryDirectory() as tmpdir:
        temp_path = Path(tmpdir) / "video.mp4"
        download_video(source_url, temp_path)

        logger.info("Uploading to S3 key: %s", args.key)
        public_url = s3.upload_file(temp_path, args.key, content_type="video/mp4")

    logger.info("=" * 60)
    logger.info("Video migration complete")
    logger.info("Public URL:  %s", public_url)
    logger.info("Set frontend env: NEXT_PUBLIC_VIDEO_URL=%s", public_url)
    logger.info("=" * 60)


if __name__ == "__main__":
    main()