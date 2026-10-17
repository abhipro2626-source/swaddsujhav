"""Settings loaded from backend/.env (or the environment)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    anon_key: str
    service_key: str
    port: int
    embedding_model: str
    retrain_every_minutes: int

    @property
    def configured(self) -> bool:
        return bool(self.supabase_url and self.anon_key and self.service_key) and \
            "YOUR-" not in self.supabase_url


def load() -> Settings:
    return Settings(
        supabase_url=os.getenv("SUPABASE_URL", "").rstrip("/"),
        anon_key=os.getenv("SUPABASE_ANON_KEY", ""),
        service_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        port=int(os.getenv("PORT", "8130")),
        embedding_model=os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
        retrain_every_minutes=int(os.getenv("RETRAIN_EVERY_MINUTES", "60")),
    )


settings = load()
