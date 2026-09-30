import logging
import mimetypes
from pathlib import Path
from typing import BinaryIO

from app.core.config import settings
from app.core.s3 import create_s3_client, public_s3_url

logger = logging.getLogger(__name__)


class S3Service:
    """Высокоуровневая обёртка над boto3 для загрузки медиафайлов."""

    def __init__(self) -> None:
        self.client = create_s3_client()
        self.bucket = settings.s3_bucket

    def upload_file(self, file_path: Path, key: str, content_type: str | None = None) -> str:
        """Загружает файл в S3, возвращает публичный URL."""
        if content_type is None:
            content_type, _ = mimetypes.guess_type(str(file_path))
            content_type = content_type or "application/octet-stream"

        with file_path.open("rb") as f:
            self.client.upload_fileobj(
                f,
                self.bucket,
                key,
                ExtraArgs={"ContentType": content_type, "ACL": "public-read"},
            )
        return public_s3_url(key)

    def upload_stream(self, stream: BinaryIO, key: str, content_type: str) -> str:
        """Загружает поток данных в S3."""
        self.client.upload_fileobj(
            stream,
            self.bucket,
            key,
            ExtraArgs={"ContentType": content_type, "ACL": "public-read"},
        )
        return public_s3_url(key)

    def key_exists(self, key: str) -> bool:
        """Проверяет наличие объекта в S3 (для идемпотентности загрузок)."""
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except self.client.exceptions.ClientError:
            return False

    def generate_signed_url(self, key: str, expires_in: int = 3600) -> str:
        """Генерирует временную подписанную ссылку (для приватных медиа)."""
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )