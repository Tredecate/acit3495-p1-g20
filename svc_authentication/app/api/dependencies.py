from typing import Generator

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import raise_api_error
from app.core.security import decode_access_token
from app.db.models import User
from app.db.session import get_db_session
from app.schemas.auth import TokenData


security = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = get_db_session()
    try:
        yield db
    finally:
        db.close()


def get_current_token_data(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> TokenData:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise_api_error(401, "unauthenticated", "Authentication required")
    return decode_access_token(credentials.credentials)


def get_current_user(token_data: TokenData = Depends(get_current_token_data), db: Session = Depends(get_db)) -> User:
    user = db.scalar(select(User).where(User.username == token_data.username))
    if user is None or not user.is_active:
        raise_api_error(401, "invalid_token", "Invalid or expired token")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise_api_error(403, "forbidden", "Admin access required")
    return current_user
