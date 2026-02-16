import logging
import os
import time

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.base import Base


logger = logging.getLogger("svc_authentication")

engine = None
SessionLocal: sessionmaker[Session] | None = None


def init_database(max_attempts: int = 10, delay_seconds: float = 1.0) -> None:
    global engine, SessionLocal

    db_directory = os.path.dirname(settings.auth_db_path)
    if db_directory:
        os.makedirs(db_directory, exist_ok=True)

    db_url = f"sqlite:///{settings.auth_db_path}"

    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            engine = create_engine(db_url, connect_args={"check_same_thread": False})
            SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
            Base.metadata.create_all(bind=engine)
            with SessionLocal() as db:
                db.execute(select(1))
            logger.info("SQLite database initialized", extra={"request_id": "startup"})
            return
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Database initialization attempt %s/%s failed: %s",
                attempt,
                max_attempts,
                exc,
                extra={"request_id": "startup"},
            )
            time.sleep(delay_seconds)

    raise RuntimeError(f"Failed to initialize SQLite database after retries: {last_error}")


def get_db_session() -> Session:
    if SessionLocal is None:
        raise RuntimeError("Database session is not initialized")
    return SessionLocal()
