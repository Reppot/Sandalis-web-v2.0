from datetime import datetime, timedelta, timezone
from app.core.security import (
    calculate_session_expiration,
    generate_session_token,
    is_session_expired,
    parse_access_tokens_registry,
)


def test_generate_session_token():
    t1 = generate_session_token()
    t2 = generate_session_token()
    assert len(t1) == 64
    assert t1 != t2


def test_session_expiration():
    now = datetime.now(timezone.utc)
    exp = calculate_session_expiration(ttl_minutes=30)
    assert exp > now
    assert not is_session_expired(exp)

    past = now - timedelta(minutes=5)
    assert is_session_expired(past)


def test_parse_access_tokens_registry_json_formats():
    # 1. Формат расширенный
    payload_extended = '{"ALPHA_KEY": {"discord_id": "999", "role": "admin", "username": "Commander"}}'
    reg1 = parse_access_tokens_registry(payload_extended)
    assert "ALPHA_KEY" in reg1
    assert reg1["ALPHA_KEY"].discord_id == "999"
    assert reg1["ALPHA_KEY"].role == "admin"
    assert reg1["ALPHA_KEY"].username == "Commander"

    # 2. Формат простой
    payload_simple = '{"BETA_KEY": "555"}'
    reg2 = parse_access_tokens_registry(payload_simple)
    assert "BETA_KEY" in reg2
    assert reg2["BETA_KEY"].discord_id == "555"
    assert reg2["BETA_KEY"].role == "member"

    # 3. Пустой / невалидный JSON
    assert parse_access_tokens_registry("") == {}
    assert parse_access_tokens_registry("invalid_json") == {}