def to_camel(value: str) -> str:
    parts = value.split("_")

    if not parts:
        return value

    return parts[0] + "".join(
        part[:1].upper() + part[1:]
        for part in parts[1:]
    )