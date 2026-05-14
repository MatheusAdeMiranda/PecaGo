"""
Storage backend para upload de imagens de produto.

STORAGE_BACKEND=local  (padrão)
    Salva arquivos em UPLOAD_DIR (default: uploads/).
    Arquivos servidos em /uploads/<filename> pelo FastAPI.

STORAGE_BACKEND=s3
    Envia para S3 ou storage S3-compatible (Cloudflare R2, MinIO, etc.).
    Requer: S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
    Opcional: S3_ENDPOINT_URL (para non-AWS), S3_PUBLIC_BASE_URL (CDN).
"""

import mimetypes
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


def _safe_extension(upload: UploadFile) -> str:
    content_type = upload.content_type or ""
    ext = mimetypes.guess_extension(content_type) or ".jpg"
    # guess_extension pode retornar .jpe para image/jpeg
    return {".jpe": ".jpg", ".jfif": ".jpg"}.get(ext, ext)


async def _read_validated(upload: UploadFile) -> bytes:
    if upload.content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(
            f"Tipo de arquivo não suportado: {upload.content_type}. "
            "Use JPEG, PNG ou WebP."
        )
    data = await upload.read()
    if len(data) > MAX_FILE_SIZE:
        raise ValueError("Arquivo muito grande. Limite: 5 MB.")
    return data


async def save_local(upload: UploadFile) -> str:
    data = await _read_validated(upload)
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{_safe_extension(upload)}"
    (upload_dir / filename).write_bytes(data)
    return f"/uploads/{filename}"


async def save_s3(upload: UploadFile) -> str:
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError(
            "boto3 não está instalado. "
            "Adicione boto3 ao requirements.txt ou use STORAGE_BACKEND=local."
        ) from exc

    data = await _read_validated(upload)
    filename = f"{uuid.uuid4().hex}{_safe_extension(upload)}"

    kwargs: dict = {}
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url

    s3 = boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        **kwargs,
    )
    s3.put_object(
        Bucket=settings.s3_bucket,
        Key=filename,
        Body=data,
        ContentType=upload.content_type or "image/jpeg",
    )

    base = settings.s3_public_base_url.rstrip("/") or (
        f"https://{settings.s3_bucket}.s3.amazonaws.com"
    )
    return f"{base}/{filename}"


async def upload_image(file: UploadFile) -> str:
    """Salva a imagem e retorna a URL pública."""
    if settings.storage_backend == "s3":
        return await save_s3(file)
    return await save_local(file)
