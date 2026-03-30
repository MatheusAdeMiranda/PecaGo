from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "PecaGo"
    database_url: str = "sqlite:///./autoparts_mvp.db"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 720

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
