from __future__ import annotations

from sqlalchemy import select

from app.core.db import AsyncSessionLocal, engine
from app.models.content import AppContent
from app.seed import seed_guide
from conftest import db, run


def test_seed_guide_deactivates_chapters_missing_from_current_manifest(db):
    async def scenario() -> None:
        async with AsyncSessionLocal() as session:
            session.add_all([
                AppContent(kind="guide_chapter", key="legacy-screen", sort=1, payload={"title": "old"}),
                AppContent(kind="guide_chapter", key="start", sort=2, payload={"title": "old start"}),
                AppContent(kind="feedback", key="form", sort=0, payload={"title": "keep"}),
            ])
            await session.commit()

        async with engine.begin() as conn:
            await seed_guide(conn, [{
                "kind": "guide_chapter",
                "key": "start",
                "sort": 0,
                "payload": {"title": "current start"},
            }])

        async with AsyncSessionLocal() as session:
            rows = (await session.execute(select(AppContent).order_by(AppContent.kind, AppContent.key))).scalars().all()
            states = {(row.kind, row.key): (row.is_active, row.payload) for row in rows}

        assert states[("guide_chapter", "legacy-screen")][0] is False
        assert states[("guide_chapter", "start")] == (True, {"title": "current start"})
        assert states[("feedback", "form")][0] is True

    run(scenario())
