from fastapi import APIRouter

from app.api.v1 import auth, clan_roles, codes, content, health, items, orders, reports, stockpiles, timers, world

api_router = APIRouter()
api_router.include_router(health.router)   # публичный
api_router.include_router(content.router)  # GET публичный: экран входа читает медиа до логина
api_router.include_router(auth.router)     # /me защищён; dev-token/redeem-code по своим правилам
api_router.include_router(orders.router)
api_router.include_router(reports.router)
api_router.include_router(clan_roles.router)   # = reports.settings_router + /clan/discord-roles
api_router.include_router(items.router)
api_router.include_router(items.recipes_router)
api_router.include_router(codes.router)    # legacy-алиас поиска предметов (совместимость v1)
api_router.include_router(stockpiles.router)
api_router.include_router(timers.router)
api_router.include_router(world.router)    # регионы и города (War API)
