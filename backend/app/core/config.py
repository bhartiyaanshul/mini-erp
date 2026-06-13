from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment / .env.

    All persistence hangs off DATABASE_URL: point it at a Postgres DSN and
    nothing else in the codebase changes.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "sqlite:///./mini_erp.db"
    JWT_SECRET: str = "dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Predictive procurement. The numbers are computed deterministically; Groq
    # only narrates them. Leave GROQ_API_KEY empty to fall back to a templated
    # briefing; the feature works either way.
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    # The Copilot's tool-calling loop runs on a model that's reliable at tool use
    # and has its own quota; keep the 70B for the narration briefing.
    GROQ_ASSISTANT_MODEL: str = "openai/gpt-oss-20b"
    FORECAST_LOOKBACK_DAYS: int = 30
    FORECAST_LEAD_TIME_DAYS: int = 7
    FORECAST_SAFETY_DAYS: int = 3

    # Email OTP for signup. Leave SMTP_HOST blank to use the dev fallback:
    # the OTP is logged to the server console and returned as `dev_otp`, so the
    # signup flow works end-to-end without a mail server.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Mini ERP <no-reply@mini-erp.local>"
    SMTP_USE_TLS: bool = True
    OTP_EXPIRE_MINUTES: int = 10
    OTP_LENGTH: int = 6
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RESEND_COOLDOWN_SECONDS: int = 30

    @property
    def smtp_configured(self) -> bool:
        return bool(self.SMTP_HOST)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
