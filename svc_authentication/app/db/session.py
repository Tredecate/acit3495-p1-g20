import logging
import time

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.base import Base


logger = logging.getLogger("svc_authentication")

engine = None
SessionLocal: sessionmaker[Session] | None = None


def init_database(max_attempts: int = 30, delay_seconds: float = 2.0) -> None:
    global engine, SessionLocal

    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            engine = create_engine(
                settings.auth_db_url,
                pool_pre_ping=True,
                pool_size=settings.auth_db_pool_size,
                max_overflow=settings.auth_db_max_overflow,
            )
            SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
            Base.metadata.create_all(bind=engine)
            with SessionLocal() as db:
                db.execute(select(1))
            logger.info("MySQL auth database initialized", extra={"request_id": "startup"})
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

    raise RuntimeError(f"Failed to initialize MySQL auth database after retries: {last_error}")


def get_db_session() -> Session:
    if SessionLocal is None:
        raise RuntimeError("Database session is not initialized")
    return SessionLocal()
