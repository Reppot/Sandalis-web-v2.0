from fastapi import APIRouter

from app.api.v1 import auth, clan, clan_plan, clan_roles, codes, content, courses, discord, feedback, game, health, items, mail, notify, operations, orders, pyramid, reports, stats, stockpiles, timers, world

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
api_router.include_router(clan.router)     # /clan/profile
api_router.include_router(pyramid.router)   # /clan/pyramid
api_router.include_router(stats.router)     # /clan/stats
api_router.include_router(game.router)      # /clan/game — очки снабжения, лиги, рейтинги
api_router.include_router(courses.router)   # /clan/courses — курсы клана в «Обучении»
api_router.include_router(clan_plan.router)  # /clan/plan — общий план клана в «Планировании»
api_router.include_router(operations.router)  # /clan/operations — операции клана: календарь, снимки карты, опрос
api_router.include_router(mail.router)        # /mail — почта на сайте, /clan/mentions — роли для «@»
api_router.include_router(world.router)    # регионы и города (War API)
api_router.include_router(discord.router)  # кнопки на постах заказов и слэш-команды бота
api_router.include_router(notify.router)   # /notify — ЛС Discord и push в браузер
api_router.include_router(feedback.router)  # обратная связь о сайте
