import os


class Settings:
    def __init__(self) -> None:
        self.web_auth_admin_user = os.getenv("WEB_AUTH_ADMIN_USER")
        self.web_auth_admin_password = os.getenv("WEB_AUTH_ADMIN_PASSWORD")
        self.auth_db_path = os.getenv("AUTH_DB_PATH", "/data/auth.db")
        self.auth_jwt_secret = os.getenv("AUTH_JWT_SECRET")
        self.auth_token_ttl_seconds = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", "3600"))
        self.auth_bcrypt_rounds = int(os.getenv("AUTH_BCRYPT_ROUNDS", "12"))

    def validate_required(self) -> None:
        missing = []
        if not self.web_auth_admin_user:
            missing.append("WEB_AUTH_ADMIN_USER")
        if not self.web_auth_admin_password:
            missing.append("WEB_AUTH_ADMIN_PASSWORD")
        if not self.auth_jwt_secret:
            missing.append("AUTH_JWT_SECRET")

        if missing:
            raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")


settings = Settings()
