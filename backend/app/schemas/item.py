from pydantic import BaseModel


class ItemOut(BaseModel):
    id: int
    code: str        # soldier_supplies
    name: str        # Soldier Supplies
    icon_key: str    # ссылка на иконку в CDN (бывш. FoxholeWikiPhotos)

    model_config = {"from_attributes": True}
