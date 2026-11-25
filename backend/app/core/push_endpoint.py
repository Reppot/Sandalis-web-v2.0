"""Validate browser push-service origins before storing or contacting them."""
from __future__ import annotations

from urllib.parse import urlsplit


PUSH_SERVICE_HOSTS = frozenset({
    "fcm.googleapis.com",
    "fcmregistrations.googleapis.com",
    "updates.push.services.mozilla.com",
    "push.services.mozilla.com",
    "web.push.apple.com",
    "notify.windows.com",
    "push.vivaldi.com",
})


def is_allowed_push_endpoint(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except (TypeError, ValueError):
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname is not None
        and parsed.hostname.lower() in PUSH_SERVICE_HOSTS
        and parsed.username is None
        and parsed.password is None
        and port in (None, 443)
    )
