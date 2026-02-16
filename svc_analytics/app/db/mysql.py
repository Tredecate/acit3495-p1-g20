from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Numeric, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


class Reading(Base):
    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(primary_key=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime)
    location: Mapped[str] = mapped_column(String(100))
    metric_type: Mapped[str] = mapped_column(
        Enum("temperature_c", "humidity_pct", "co2_ppm", name="metric_type")
    )
    metric_value: Mapped[float] = mapped_column(Numeric(10, 2))
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entered_by: Mapped[str] = mapped_column(String(50))


@dataclass
class ReadingRecord:
    recorded_at: datetime
    location: str
    metric_type: str
    metric_value: float


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class MySQLClient:
    def __init__(self) -> None:
        self.engine = create_engine(settings.mysql_dsn, pool_pre_ping=True)
        self.session_factory = sessionmaker(bind=self.engine)

    def ping(self) -> None:
        with self.engine.connect() as connection:
            connection.execute(select(1))

    def fetch_readings_in_window(
        self,
        window_start: datetime,
        window_end: datetime,
    ) -> list[ReadingRecord]:
        with Session(self.engine) as session:
            stmt = (
                select(
                    Reading.recorded_at,
                    Reading.location,
                    Reading.metric_type,
                    Reading.metric_value,
                )
                .where(Reading.recorded_at > window_start.replace(tzinfo=None))
                .where(Reading.recorded_at <= window_end.replace(tzinfo=None))
            )
            rows = session.execute(stmt).all()

        return [
            ReadingRecord(
                recorded_at=_as_utc(row.recorded_at),
                location=row.location,
                metric_type=row.metric_type,
                metric_value=float(row.metric_value),
            )
            for row in rows
        ]