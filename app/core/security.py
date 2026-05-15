import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {"sub": subject, "exp": expires_at}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def generate_refresh_token() -> tuple[str, str]:
    """Returns (raw_token, hashed_token). Store the hash; send the raw to the client."""
    raw = secrets.token_urlsafe(48)
    # sha256 é suficiente para tokens aleatórios de alta entropia (não precisa de KDF)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def verify_refresh_token(raw: str, hashed: str) -> bool:
    return hmac.compare_digest(hashlib.sha256(raw.encode()).hexdigest(), hashed)


def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
