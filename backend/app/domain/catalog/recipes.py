RECIPES: dict[str, dict] = {
    "soldier_supplies": {"in": {"bmats": 80}, "time_min": 25},
    "bmats": {"in": {"salvage": 3}, "time_min": 6},
    # …реестр переехал сюда из factory-data.ts
}


def materials_for(code: str, qty: int) -> dict[str, int]:
    # разворачивает цепочку рецептов до сырья — бывший calcChain
    needs: dict[str, int] = {}
    for mat, per_one in RECIPES[code]["in"].items():
        needs[mat] = needs.get(mat, 0) + per_one * qty
    return needs
