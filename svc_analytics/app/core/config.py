import os


class Settings:
    def __init__(self) -> None:
        self.mysql_host_addr = os.getenv("MYSQL_HOST_ADDR", "db_mysql")
        self.mysql_port = int(os.getenv("MYSQL_PORT", "3306"))
        self.mysql_database = os.getenv("MYSQL_DATABASE")
        self.mysql_user = os.getenv("MYSQL_USER")
        self.mysql_password = os.getenv("MYSQL_PASSWORD")

        self.mongo_host_addr = os.getenv("MONGO_HOST_ADDR", "db_mongodb")
        self.mongo_port = int(os.getenv("MONGO_PORT", "27017"))
        self.mongo_database = os.getenv("MONGO_INITDB_DATABASE")
        self.mongo_username = os.getenv("MONGO_INITDB_ROOT_USERNAME")
        self.mongo_password = os.getenv("MONGO_INITDB_ROOT_PASSWORD")

        self.analytics_interval_seconds = int(os.getenv("ANALYTICS_INTERVAL_SECONDS", "60"))

    def validate_required(self) -> None:
        missing = []
        if not self.mysql_database:
            missing.append("MYSQL_DATABASE")
        if not self.mysql_user:
            missing.append("MYSQL_USER")
        if not self.mysql_password:
            missing.append("MYSQL_PASSWORD")
        if not self.mongo_database:
            missing.append("MONGO_INITDB_DATABASE")
        if not self.mongo_username:
            missing.append("MONGO_INITDB_ROOT_USERNAME")
        if not self.mongo_password:
            missing.append("MONGO_INITDB_ROOT_PASSWORD")
        if self.analytics_interval_seconds <= 0:
            raise RuntimeError("ANALYTICS_INTERVAL_SECONDS must be greater than 0")

        if missing:
            raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

    @property
    def mysql_dsn(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}@"
            f"{self.mysql_host_addr}:{self.mysql_port}/{self.mysql_database}"
        )

    @property
    def mongo_uri(self) -> str:
        return (
            f"mongodb://{self.mongo_username}:{self.mongo_password}@"
            f"{self.mongo_host_addr}:{self.mongo_port}/?authSource=admin"
        )


settings = Settings()