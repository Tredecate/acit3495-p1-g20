from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=200)
    is_admin: bool = False
    is_active: bool = True


class UserPatchRequest(BaseModel):
    password: str | None = Field(default=None, min_length=8, max_length=200)
    is_admin: bool | None = None
    is_active: bool | None = None

    @field_validator("password")
    @classmethod
    def strip_password(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("password must not be empty")
        return value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str
    is_admin: bool
    is_active: bool
    created_at: str
    updated_at: str


class UserCreateResponse(BaseModel):
    username: str
    is_admin: bool
    is_active: bool
    created_at: str
