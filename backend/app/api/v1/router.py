from fastapi import APIRouter

from app.api.v1 import health, orders

api_router = APIRouter()
api_router.include_router(health.router)   # публичный
api_router.include_router(orders.router)
# api_router.include_router(stockpiles.router)
# api_router.include_router(timers.router)
