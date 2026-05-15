from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "PecaGo"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = True

    database_url: str = "sqlite:///./autoparts_mvp.db"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        # Railway fornece postgresql:// mas psycopg3 exige postgresql+psycopg://
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+psycopg://", 1)
        return v
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    allowed_origins: list[str] = ["*"]

    # Mercado Pago
    mercadopago_access_token: str = ""          # TEST-xxx para sandbox, APP_USR-xxx para produção
    mercadopago_webhook_secret: str = ""        # segredo para validar assinatura do webhook
    app_base_url: str = "http://localhost:8000" # usado nas URLs de retorno do MP

    # Storage: "local" salva em UPLOAD_DIR; "s3" envia para S3-compatible
    storage_backend: str = "local"
    upload_dir: str = "uploads"

    # S3 (obrigatório quando storage_backend="s3")
    s3_bucket: str = ""
    s3_endpoint_url: str = ""       # deixe vazio para AWS padrão
    s3_public_base_url: str = ""    # URL pública dos arquivos (CDN ou endpoint público)
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
