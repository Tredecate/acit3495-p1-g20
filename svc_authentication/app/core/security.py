import time

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.errors import raise_api_error
from app.schemas.auth import TokenData


pwd_context: CryptContext | None = None


def init_password_context() -> None:
    global pwd_context
    pwd_context = CryptContext(
        schemes=["bcrypt"],
        deprecated="auto",
        bcrypt__rounds=settings.auth_bcrypt_rounds,
    )


def hash_password(password: str) -> str:
    if pwd_context is None:
        raise RuntimeError("Password context is not initialized")
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if pwd_context is None:
        raise RuntimeError("Password context is not initialized")
    return pwd_context.verify(password, password_hash)


def create_access_token(username: str, is_admin: bool) -> str:
    now = int(time.time())
    payload = {
        "sub": username,
        "is_admin": is_admin,
        "iat": now,
        "exp": now + settings.auth_token_ttl_seconds,
    }
    return jwt.encode(payload, settings.auth_jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, settings.auth_jwt_secret, algorithms=["HS256"])
        username = payload.get("sub")
        is_admin = payload.get("is_admin")
        if not username or not isinstance(is_admin, bool):
            raise_api_error(401, "invalid_token", "Invalid or expired token")
        return TokenData(username=username, is_admin=is_admin)
    except JWTError:
        raise_api_error(401, "invalid_token", "Invalid or expired token")
