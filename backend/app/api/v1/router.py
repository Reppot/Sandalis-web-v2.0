from fastapi import APIRouter

from app.api.v1 import auth, codes, health, items, orders, stockpiles, timers

api_router = APIRouter()
api_router.include_router(health.router)   # публичный
api_router.include_router(auth.router)     # /me защищён; dev-token/redeem-code по своим правилам
api_router.include_router(orders.router)
api_router.include_router(items.router)
api_router.include_router(codes.router)    # legacy-алиас поиска предметов (совместимость v1)
api_router.include_router(stockpiles.router)
api_router.include_router(timers.router)
