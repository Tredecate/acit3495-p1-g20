from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.core.config import settings
from app.core.errors import raise_api_error
from app.core.security import create_access_token, verify_password
from app.db.models import User
from app.schemas.auth import AuthMeResponse, LoginRequest, LoginResponse, LoginResponseUser


router = APIRouter()


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise_api_error(401, "invalid_credentials", "Invalid username or password")

    token = create_access_token(user.username, user.is_admin)
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.auth_token_ttl_seconds,
        user=LoginResponseUser(username=user.username, is_admin=user.is_admin),
    )


@router.get("/auth/me", response_model=AuthMeResponse)
def auth_me(current_user: User = Depends(get_current_user)):
    return AuthMeResponse(authenticated=True, username=current_user.username, is_admin=current_user.is_admin)
