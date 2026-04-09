import os


class Settings:
    def __init__(self) -> None:
        self.web_auth_admin_user = os.getenv("WEB_AUTH_ADMIN_USER")
        self.web_auth_admin_password = os.getenv("WEB_AUTH_ADMIN_PASSWORD")
        self.auth_jwt_secret = os.getenv("AUTH_JWT_SECRET")
        self.auth_token_ttl_seconds = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", "3600"))
        self.auth_bcrypt_rounds = int(os.getenv("AUTH_BCRYPT_ROUNDS", "12"))

        # MySQL connection for the auth schema. Shares the cluster MySQL StatefulSet
        # but uses its own database/user so blast radius stays small.
        self.auth_mysql_host = os.getenv("AUTH_MYSQL_HOST", "mysql-service")
        self.auth_mysql_port = int(os.getenv("AUTH_MYSQL_PORT", "3306"))
        self.auth_mysql_user = os.getenv("AUTH_MYSQL_USER")
        self.auth_mysql_password = os.getenv("AUTH_MYSQL_PASSWORD")
        self.auth_mysql_database = os.getenv("AUTH_MYSQL_DATABASE", "auth")

        # SQLAlchemy pool sizing. With N replicas and pool=5 + overflow=5, total
        # connections = N * 10. Stay below MySQL max_connections (default 151).
        self.auth_db_pool_size = int(os.getenv("AUTH_DB_POOL_SIZE", "5"))
        self.auth_db_max_overflow = int(os.getenv("AUTH_DB_MAX_OVERFLOW", "5"))

    @property
    def auth_db_url(self) -> str:
        return (
            f"mysql+pymysql://{self.auth_mysql_user}:{self.auth_mysql_password}"
            f"@{self.auth_mysql_host}:{self.auth_mysql_port}/{self.auth_mysql_database}"
            f"?charset=utf8mb4"
        )

    def validate_required(self) -> None:
        missing = []
        if not self.web_auth_admin_user:
            missing.append("WEB_AUTH_ADMIN_USER")
        if not self.web_auth_admin_password:
            missing.append("WEB_AUTH_ADMIN_PASSWORD")
        if not self.auth_jwt_secret:
            missing.append("AUTH_JWT_SECRET")
        if not self.auth_mysql_user:
            missing.append("AUTH_MYSQL_USER")
        if not self.auth_mysql_password:
            missing.append("AUTH_MYSQL_PASSWORD")

        if missing:
            raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")


settings = Settings()
