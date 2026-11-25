# Foxhole Operations Toolbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Sandalis into a connected Foxhole operations workspace by integrating tactical map, shared planning, supply readiness, and actionable logistics tasks.

**Architecture:** Extend the existing React feature modules, FastAPI services, SQLAlchemy models, and clan permission system. Keep the War API as the source for world facts, label derived estimates and data freshness, and use existing stockpiles, orders, operations, timers, and shared clan plans as the integration points. Avoid new packages unless the current stack cannot support a requirement.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, FastAPI, SQLAlchemy 2, PostgreSQL, existing Foxhole War API and catalog.

**Spec:** `docs/audit-2026-11-25-ui-and-gameplay.md` plus the user's request to include competitor features and the other audit findings.

## Global Constraints

- Preserve Sandalis architecture and existing product style.
- New and revised interface copy must support Russian and English; do not bulk-edit other locales.
- Do not request dynamic building data for map regions until users select those regions.
- Keep world facts, user-confirmed reports, and calculated estimates visibly distinct.
- Respect clan permissions and keep personal drafts usable without a clan.
- Preserve existing pyramid levels; remove only the separate «сейчас привезти» phrase/card.
- Do not encode dev-branch Foxhole data as live data.

## Review Focus

- Empty region selection makes no dynamic War API requests; selecting multiple regions loads only those keys.
- A failed or stale stockpile scan is never presented as current stock.
- Two members claiming/updating a task cannot silently overwrite each other's change.
- User-controlled labels and operation notes remain safe and bounded.
- Mobile, keyboard, RU/EN, and non-default locale fallbacks remain usable.

---

### Task 1: Dedicated guide environment and current navigation screenshots

**Files:** `tools/guide/*`, `backend/static/guide/{ru,en}/*`, `backend/app/seed/data/guide.json`.

- [ ] Confirm the `sandalis-test-pg` database is healthy and demo data can be seeded.
- [ ] Start the guide backend on 8020 and production frontend on 3300.
- [ ] Run the Puppeteer guide generator; correct failed selectors and capture current Russian and English planning screens.
- [ ] Verify each marker highlights the intended control and the selected-map image has a visible region outline.
- [ ] Keep Czech and other stored guide locales intact.

### Task 2: Tactical map search, layers, settings, and tactical markers

**Files:** `frontend/src/features/planning/model/map.ts`, `MapCanvas.tsx`, `PlanningWorkspace.tsx`, `ToolsPanel.tsx`, map styles/i18n; backend only for persisted group markers if existing clan-plan JSON cannot represent them.

- [ ] Add region/town search with keyboard navigation, match highlighting, and a map jump action.
- [ ] Make layer/filter controls discoverable and add usable saved view presets without changing overview-data loading.
- [ ] Complete typed map annotations: objective, intel, repair, anti-air/threat, depot, route, and rally point; include color, note, author, expiry, and shared/private scope.
- [ ] Verify clan-shared annotations use the existing plan permission path and expire/clear predictably.

### Task 3: Measurements and route planning

**Files:** `frontend/src/features/planning/model/plan.ts`, `MapCanvas.tsx`, `ToolsPanel.tsx`, `frontend/src/shared/i18n/messages/{ru,en}.ts`.

- [ ] Add distance and azimuth readout for ruler lines using map coordinates.
- [ ] Add range presets for relevant existing catalog structures/weapons; keep unknown ranges unavailable rather than inventing values.
- [ ] Add travel-time estimates by vehicle and configurable speed, with the estimate and assumptions displayed beside the result.
- [ ] Allow a route to use ordered map waypoints, calculate its total length/ETA, and save it as a shared planning shape.

### Task 4: Frontline readiness and fresh stockpile context

**Files:** `backend/app/services/war_map.py`, `backend/app/api/v1/world.py`, world schemas, `PlanningWorkspace.tsx`, `StorageMonitor.tsx`, and supply models.

- [ ] Join the estimated town-hall frontline with selected-region base types and their fetched stock data only when requested.
- [ ] Show last-updated time and distinguish War API intel from manually imported stockpile quantities.
- [ ] Add a configurable base profile: essential materials, Soldier Supplies, rifles/ammunition, anti-tank equipment/ammunition, plus optional situation packs.
- [ ] Calculate missing amounts from targets and actual stock; keep recommendations marked as estimates and never include legacy “bunker supplies” items.

### Task 5: Deficit-to-delivery logistics tasks

**Files:** existing report/order task models and APIs first; add a focused logistics-task model/service/API only where current operation/report tasks cannot represent stages, ownership, and stock source.

- [ ] Turn a confirmed deficit into linked gather/refine/produce/ship tasks with destination, source, crate/unit quantity, priority, owner, status, and operation/base association.
- [ ] Let eligible clan members claim, release, and complete a task; record actor and timestamps.
- [ ] Prevent duplicate active tasks for the same requested item/destination and handle concurrent updates optimistically.
- [ ] Surface a stage tracker and progress in operations and clan-order views; allow manual delivery confirmation when no game API can verify it.
- [ ] Add location-specific production/stock checks where Sandalis already has the necessary data; visibly label unavailable data.

### Task 6: Personal/team plan portability and history

**Files:** planning snapshot model/UI, operation snapshot APIs and clan plan persistence.

- [ ] Add explicit personal draft vs clan plan context and explain where changes are saved.
- [ ] Add safe export/import for plan snapshots with schema versioning and validation.
- [ ] Add a readable change history for shared plans and recovery from an earlier revision.
- [ ] Preserve existing operation snapshots and avoid silently replacing remote changes.

### Task 7: Air, sea, and accessibility coverage

**Files:** map data adapters, structure catalog, `MapCanvas.tsx`, `ToolsPanel.tsx`, guide and locale strings.

- [ ] Add live-data-backed air-intel/radar coverage and air/sea planning layers only where the current API/catalog supports them.
- [ ] Keep dev-branch vehicle/building entries behind versioned data and do not expose them as current live game data.
- [ ] Verify keyboard access, focus visibility, touch target sizes, color alternatives, and screen-reader names for map and drawing controls.
- [ ] Complete the RU/EN help chapter with captured screenshots, useful marker names, and mobile layout review.

### Task 8: End-to-end verification and audit update

- [ ] Run backend unit/API tests for selected-region filtering, freshness and task state transitions.
- [ ] Run frontend typecheck/build and focused browser flows for map selection, measurements, shared annotations, task claims, and plan import/export.
- [ ] Review desktop/mobile and Russian/English renders; resolve critical and important findings.
- [ ] Update `docs/audit-2026-11-25-ui-and-gameplay.md` with shipped capabilities, remaining gaps, and verified results.
