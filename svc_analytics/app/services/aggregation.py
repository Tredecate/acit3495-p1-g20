from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from app.db.mysql import ReadingRecord


@dataclass
class Aggregate:
    count: int = 0
    total: float = 0.0
    min_value: float | None = None
    max_value: float | None = None
    last_recorded_at: datetime | None = None

    def add(self, value: float, recorded_at: datetime) -> None:
        self.count += 1
        self.total += value
        self.min_value = value if self.min_value is None else min(self.min_value, value)
        self.max_value = value if self.max_value is None else max(self.max_value, value)
        if self.last_recorded_at is None or recorded_at > self.last_recorded_at:
            self.last_recorded_at = recorded_at


def _to_group_doc(metric_type: str, location: str, aggregate: Aggregate) -> dict[str, object]:
    return {
        "metric_type": metric_type,
        "location": location,
        "count": aggregate.count,
        "min": float(aggregate.min_value),
        "max": float(aggregate.max_value),
        "avg": aggregate.total / aggregate.count,
        "last_recorded_at": aggregate.last_recorded_at,
    }


def _to_global_doc(metric_type: str, aggregate: Aggregate) -> dict[str, object]:
    return {
        "metric_type": metric_type,
        "count": aggregate.count,
        "min": float(aggregate.min_value),
        "max": float(aggregate.max_value),
        "avg": aggregate.total / aggregate.count,
        "last_recorded_at": aggregate.last_recorded_at,
    }


def build_snapshot(
    readings: list[ReadingRecord],
    window_start: datetime,
    window_end: datetime,
) -> dict[str, object]:
    grouped: dict[tuple[str, str], Aggregate] = {}
    global_by_metric: dict[str, Aggregate] = {}

    for reading in readings:
        group_key = (reading.metric_type, reading.location)
        group_aggregate = grouped.setdefault(group_key, Aggregate())
        group_aggregate.add(reading.metric_value, reading.recorded_at)

        global_aggregate = global_by_metric.setdefault(reading.metric_type, Aggregate())
        global_aggregate.add(reading.metric_value, reading.recorded_at)

    groups_docs = [
        _to_group_doc(metric_type, location, aggregate)
        for (metric_type, location), aggregate in sorted(grouped.items())
    ]
    global_docs = [
        _to_global_doc(metric_type, aggregate)
        for metric_type, aggregate in sorted(global_by_metric.items())
    ]

    return {
        "calculated_at": datetime.now(timezone.utc),
        "window_start": window_start,
        "window_end": window_end,
        "source_count": len(readings),
        "groups": groups_docs,
        "global_by_metric": global_docs,
    }