from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any, Mapping

from app.core.config import settings

logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parents[2]      # .../backend/app
DOMAIN_DIR = APP_DIR / "domain"
CORE_LOCALES = APP_DIR / "core" / "locales"

# {domain: {locale: {"flat.key": "text"}}}
_REGISTRY: dict[str, dict[str, dict[str, str]]] = {}
_LOCK = threading.Lock()
_LOADED = False


def _flatten(node: Mapping[str, Any], prefix: str = "") -> dict[str, str]:
    flat: dict[str, str] = {}
    for key, value in node.items():
        path = f"{prefix}{key}"
        if isinstance(value, Mapping):
            flat.update(_flatten(value, f"{path}."))
        else:
            flat[path] = str(value)
    return flat


def _load_dir(domain: str, locales_dir: Path) -> None:
    bucket = _REGISTRY.setdefault(domain, {})
    for file in sorted(locales_dir.glob("*.json")):
        locale = file.stem.lower()
        if locale not in settings.SUPPORTED_LOCALES:
            continue
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.error("i18n: bad catalog %s: %s", file, exc)
            continue
        bucket.setdefault(locale, {}).update(_flatten(data))


def load_catalogs(force: bool = False) -> None:
    """
    Никакого монолита: обходим app/domain/<domain>/locales/<locale>.json.
    Добавление нового домена = создание папки, правки кода не требуются.
    """
    global _LOADED
    with _LOCK:
        if _LOADED and not force:
            return
        _REGISTRY.clear()
        if CORE_LOCALES.is_dir():
            _load_dir("core", CORE_LOCALES)
        if DOMAIN_DIR.is_dir():
            for domain_path in sorted(p for p in DOMAIN_DIR.iterdir() if p.is_dir()):
                locales_dir = domain_path / "locales"
                if locales_dir.is_dir():
                    _load_dir(domain_path.name, locales_dir)
        _LOADED = True
        logger.info(
            "i18n loaded: %s",
            {d: sorted(v) for d, v in _REGISTRY.items()},
        )


def lookup(domain: str, locale: str, key: str) -> str | None:
    if settings.I18N_HOT_RELOAD:
        load_catalogs(force=True)
    elif not _LOADED:
        load_catalogs()
    return _REGISTRY.get(domain, {}).get(locale, {}).get(key)


def known_domains() -> tuple[str, ...]:
    if not _LOADED:
        load_catalogs()
    return tuple(_REGISTRY)
