from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, require_admin
from app.core.errors import raise_api_error
from app.core.security import hash_password
from app.db.models import User
from app.schemas.user import UserCreateRequest, UserCreateResponse, UserOut, UserPatchRequest
from app.utils.datetime import now_utc_iso


router = APIRouter()


def active_admin_count(db: Session) -> int:
    admins = db.scalars(select(User).where(User.is_admin.is_(True), User.is_active.is_(True))).all()
    return len(admins)


@router.post("/users", response_model=UserCreateResponse, status_code=201)
def create_user(payload: UserCreateRequest, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    timestamp = now_utc_iso()
    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        is_admin=payload.is_admin,
        is_active=payload.is_active,
        created_at=timestamp,
        updated_at=timestamp,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise_api_error(409, "user_exists", "Username already exists")

    return UserCreateResponse(
        username=user.username,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.get("/users", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.scalars(select(User).order_by(User.username.asc())).all()
    return users


@router.patch("/users/{username}", response_model=UserOut)
def patch_user(
    username: str,
    payload: UserPatchRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise_api_error(400, "invalid_patch", "At least one field must be provided")

    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        raise_api_error(404, "not_found", "User not found")

    if "is_admin" in update_data and update_data["is_admin"] is False and user.is_admin and user.is_active:
        if active_admin_count(db) <= 1:
            raise_api_error(
                400,
                "last_admin_guard",
                "Cannot remove admin rights from the last active admin",
            )

    if "is_active" in update_data and update_data["is_active"] is False and user.is_admin and user.is_active:
        if active_admin_count(db) <= 1:
            raise_api_error(
                400,
                "last_admin_guard",
                "Cannot deactivate the last active admin",
            )

    if "password" in update_data and update_data["password"] is not None:
        user.password_hash = hash_password(update_data["password"])

    if "is_admin" in update_data and update_data["is_admin"] is not None:
        user.is_admin = update_data["is_admin"]

    if "is_active" in update_data and update_data["is_active"] is not None:
        user.is_active = update_data["is_active"]

    user.updated_at = now_utc_iso()

    db.add(user)
    db.commit()
    db.refresh(user)
    return user
