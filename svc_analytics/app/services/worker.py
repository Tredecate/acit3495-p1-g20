from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.logging import log_event
from app.db.mongo import MongoAnalyticsClient
from app.db.mysql import MySQLClient
from app.services.aggregation import build_snapshot


class AnalyticsWorker:
    def __init__(self) -> None:
        self.mysql = MySQLClient()
        self.mongo = MongoAnalyticsClient()
        self.interval_seconds = settings.analytics_interval_seconds
        self.last_window_end: datetime | None = None

    def wait_for_dependencies(self) -> None:
        attempt = 0
        while True:
            attempt += 1
            try:
                self.mysql.ping()
                self.mongo.ping()
                log_event("info", "dependencies_ready", attempt=attempt)
                return
            except Exception as exc:
                log_event(
                    "warning",
                    "dependencies_waiting",
                    attempt=attempt,
                    error=str(exc),
                )
                time.sleep(3)

    def run_once(self) -> None:
        now = datetime.now(timezone.utc)
        window_start = self.last_window_end or (now - timedelta(seconds=self.interval_seconds))
        window_end = now

        readings = self.mysql.fetch_readings_in_window(window_start=window_start, window_end=window_end)
        snapshot = build_snapshot(readings=readings, window_start=window_start, window_end=window_end)
        self.mongo.insert_snapshot(snapshot)
        self.last_window_end = window_end

        log_event(
            "info",
            "snapshot_written",
            window_start=window_start.isoformat(),
            window_end=window_end.isoformat(),
            source_count=len(readings),
            groups_count=len(snapshot["groups"]),
            global_metrics_count=len(snapshot["global_by_metric"]),
        )

    def run_forever(self) -> None:
        self.wait_for_dependencies()
        while True:
            started = time.monotonic()
            try:
                self.run_once()
            except Exception as exc:
                log_event("error", "run_failed", error=str(exc))

            elapsed = time.monotonic() - started
            sleep_seconds = max(1, self.interval_seconds - int(elapsed))
            time.sleep(sleep_seconds)