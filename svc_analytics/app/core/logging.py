import json
import logging
from datetime import datetime, timezone
from typing import Any


logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("svc_analytics")


def log_event(level: str, event: str, **fields: Any) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "service": "svc_analytics",
        "event": event,
        **fields,
    }
    message = json.dumps(payload, default=str)

    if level == "error":
        logger.error(message)
        return
    if level == "warning":
        logger.warning(message)
        return
    logger.info(message)