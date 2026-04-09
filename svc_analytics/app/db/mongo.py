from typing import Any

from pymongo import ASCENDING, MongoClient

from app.core.config import settings


class MongoAnalyticsClient:
    def __init__(self) -> None:
        self.client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000)
        self.collection = self.client[settings.mongo_database]["analytics_snapshots"]
        # Idempotency guard: even though svc_analytics is pinned to a single
        # replica in k8s, a pod restart that re-runs an in-flight window must
        # not produce duplicate snapshots.
        self.collection.create_index(
            [("window_start", ASCENDING), ("window_end", ASCENDING)],
            name="uniq_window_bounds",
            unique=True,
        )

    def ping(self) -> None:
        self.client.admin.command("ping")

    def insert_snapshot(self, snapshot_document: dict[str, Any]) -> None:
        # Upsert by (window_start, window_end). Safe under restart and avoids
        # the duplicate-key crash that a plain insert_one would produce.
        self.collection.update_one(
            {
                "window_start": snapshot_document.get("window_start"),
                "window_end": snapshot_document.get("window_end"),
            },
            {"$set": snapshot_document},
            upsert=True,
        )
