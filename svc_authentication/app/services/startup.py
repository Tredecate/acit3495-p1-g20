import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password, init_password_context
from app.db.models import User
from app.db.session import get_db_session, init_database
from app.utils.datetime import now_utc_iso


logger = logging.getLogger("svc_authentication")


def seed_initial_admin() -> None:
    with get_db_session() as db:
        existing_user = db.scalar(select(User.id).limit(1))
        if existing_user is not None:
            logger.info("Users exist; skipping admin seed", extra={"request_id": "startup"})
            return

        timestamp = now_utc_iso()
        admin_user = User(
            username=settings.web_auth_admin_user,
            password_hash=hash_password(settings.web_auth_admin_password),
            is_admin=True,
            is_active=True,
            created_at=timestamp,
            updated_at=timestamp,
        )
        db.add(admin_user)
        db.commit()
        logger.info("Seeded initial admin user", extra={"request_id": "startup"})


def initialize_service() -> None:
    settings.validate_required()
    init_password_context()
    init_database()
    seed_initial_admin()
