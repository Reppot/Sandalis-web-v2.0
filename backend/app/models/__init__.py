"""Все модели импортированы здесь, чтобы метаданные и мапперы были полными."""
from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin
from app.models.catalog import CatalogItem
from app.models.clan_settings import ClanSettings
from app.models.code import ClanInviteCode
from app.models.content import AppContent
from app.models.course import ClanCourse
from app.models.operation import ClanOperation
from app.models.mail import ClanMail
from app.models.report_event import ReportEvent
from app.models.feedback import Feedback
from app.models.order import Order, OrderStatus
from app.models.rbac import Clan, ClanApiToken, ClanMembership, User
from app.models.recipe import ProductionRecipe
from app.models.setup import DiscordSetup
from app.models.report import OrderReport, OrderReportLine, ReportContribution, ReportContributionLine, ReportStatus
from app.models.stockpile import Stockpile, StockpileItem
from app.models.timer import Timer, TimerEvent

__all__ = [
    "Base", "ClanScopedMixin", "TimestampMixin", "UUIDPkMixin",
    "AppContent", "CatalogItem", "ClanCourse", "ClanMail", "ReportEvent", "ClanOperation", "Feedback", "Order", "OrderStatus",
    "Clan", "ClanApiToken", "DiscordSetup", "ClanInviteCode", "ClanMembership", "ClanSettings", "User",
    "OrderReport", "OrderReportLine", "ReportContribution", "ReportContributionLine", "ProductionRecipe", "ReportStatus",
    "Stockpile", "StockpileItem", "Timer", "TimerEvent",
]
