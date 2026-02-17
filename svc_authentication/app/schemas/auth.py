from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class LoginResponseUser(BaseModel):
    username: str
    is_admin: bool


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user: LoginResponseUser


class AuthMeResponse(BaseModel):
    authenticated: bool
    username: str
    is_admin: bool


class TokenData(BaseModel):
    username: str
    is_admin: bool
