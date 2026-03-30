from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.db import Base, engine
from app.routers import auth, deliveries, demo, orders, products, stores


Base.metadata.create_all(bind=engine)
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
FRONTEND_DIST_DIR = BASE_DIR.parent / "frontend" / "dist"
FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"

app = FastAPI(
    title="PecaGo",
    description="API MVP para marketplace de autopecas com entrega sob demanda.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(stores.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(deliveries.router)
app.include_router(demo.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

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
