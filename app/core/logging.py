import logging
import sys
import uuid

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings


def configure_logging() -> None:
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    is_dev = settings.database_url.startswith("sqlite")

    structlog.configure(
        processors=shared_processors + [
            structlog.dev.ConsoleRenderer() if is_dev
            else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
        cache_logger_on_first_use=True,
    )


logger = structlog.get_logger("pecago")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())[:8]
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        response = await call_next(request)

        if response.status_code >= 500:
            logger.error(
                "request_failed",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
            )
        elif response.status_code >= 400:
            logger.warning(
                "request_error",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
            )

        return response
