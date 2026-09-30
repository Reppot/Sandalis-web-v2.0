import boto3
from botocore.config import Config

from app.core.config import settings


def create_s3_client():
    """Единая фабрика S3-клиента (Cloudflare R2 / Backblaze B2 / AWS S3)."""
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint or None,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        ),
        region_name="auto",  # R2 использует "auto"
    )


def public_s3_url(key: str) -> str:
    """Формирует публичный URL объекта в S3 без подписи (для CDN)."""
    endpoint = settings.s3_endpoint.rstrip("/")
    bucket = settings.s3_bucket
    return f"{endpoint}/{bucket}/{key}"