from typing import Any

from pymongo import MongoClient

from app.core.config import settings


class MongoAnalyticsClient:
    def __init__(self) -> None:
        self.client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000)
        self.collection = self.client[settings.mongo_database]["analytics_snapshots"]

    def ping(self) -> None:
        self.client.admin.command("ping")

    def insert_snapshot(self, snapshot_document: dict[str, Any]) -> None:
        self.collection.insert_one(snapshot_document)