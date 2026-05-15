from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.limiter import limiter
from app.core.logging import RequestLoggingMiddleware, configure_logging, logger
from app.routers import auth, deliveries, demo, notifications, orders, payment, products, reviews, stores

UPLOAD_DIR = Path(settings.upload_dir)


def _run_migrations() -> None:
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
FRONTEND_DIST_DIR = BASE_DIR.parent / "frontend" / "dist"
FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"

configure_logging()
_run_migrations()
logger.info("startup", version="0.1.0")

app = FastAPI(
    title="PecaGo",
    description="API MVP para marketplace de autopecas com entrega sob demanda.",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(stores.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(deliveries.router)
app.include_router(notifications.router)
app.include_router(payment.router)
app.include_router(reviews.router)
app.include_router(demo.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if settings.storage_backend == "local":
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

if FRONTEND_ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS_DIR), name="frontend-assets")


def resolve_frontend_entry(default_name: str) -> Path:
    built_index = FRONTEND_DIST_DIR / "index.html"
    if built_index.exists():
        return built_index
    return STATIC_DIR / default_name


@app.get("/")
def frontend() -> FileResponse:
    return FileResponse(resolve_frontend_entry("index.html"))


@app.get("/console")
def console_page() -> FileResponse:
    return FileResponse(resolve_frontend_entry("console.html"))


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "service": "pecago"}
