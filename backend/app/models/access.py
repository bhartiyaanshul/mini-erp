from sqlmodel import Field, SQLModel

from app.models.enums import AccessLevel, ModuleName


class UserModuleAccess(SQLModel, table=True):
    """One row per (user, module): the access level a System User has on a
    module. System Administrators bypass these rows entirely."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    module: ModuleName
    level: AccessLevel = Field(default=AccessLevel.NONE)
