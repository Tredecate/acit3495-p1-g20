from app.core.config import settings
from app.core.logging import log_event
from app.services.worker import AnalyticsWorker


def main() -> None:
    settings.validate_required()
    log_event("info", "service_starting", interval_seconds=settings.analytics_interval_seconds)
    worker = AnalyticsWorker()
    worker.run_forever()


if __name__ == "__main__":
    main()