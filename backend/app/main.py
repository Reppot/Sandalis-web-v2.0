# app/main.py — только сборка: CORS, роутеры, healthcheck.
# Строчки бизнес-логики здесь быть не должно никогда.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, codes, items, orders, stockpiles, timers
from app.core.config import settings

app = FastAPI(title="Sandalis API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,  # cookie-сессия от фронта
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])
app.include_router(stockpiles.router, prefix="/api/v1/stockpiles", tags=["stockpiles"])
app.include_router(timers.router, prefix="/api/v1/timers", tags=["timers"])
app.include_router(codes.router, prefix="/api/v1/codes", tags=["codes"])
app.include_router(items.router, prefix="/api/v1/items", tags=["items"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
