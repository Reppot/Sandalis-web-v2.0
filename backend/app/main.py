from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.auth import router as auth_router
from app.api.v1.codes import router as codes_router
from app.api.v1.health import router as health_router
from app.api.v1.items import router as items_router
from app.api.v1.orders import router as orders_router
from app.api.v1.stockpiles import router as stockpiles_router
from app.api.v1.timers import router as timers_router
from app.core.config import settings
from app.core.db import engine


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))

    yield

    await engine.dispose()


app = FastAPI(
    title="Sandalis API",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(orders_router, prefix="/api/v1")
app.include_router(stockpiles_router, prefix="/api/v1")
app.include_router(timers_router, prefix="/api/v1")
app.include_router(items_router, prefix="/api/v1")
app.include_router(codes_router, prefix="/api/v1")