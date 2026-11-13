import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.security import password_problems


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    role: str
    is_active: bool
    email_verified: bool
    viewer_of_id: uuid.UUID | None = None
    created_at: datetime
    last_login_at: datetime | None = None


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(max_length=128)
    confirm_password: str

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name is required")
        return v

    @model_validator(mode="after")
    def _check(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        problems = password_problems(self.password, str(self.email), self.name)
        if problems:
            raise ValueError(" ".join(problems))
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = False


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(max_length=128)

    @model_validator(mode="after")
    def _check(self):
        problems = password_problems(self.new_password)
        if problems:
            raise ValueError(" ".join(problems))
        return self


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)

    @model_validator(mode="after")
    def _check(self):
        problems = password_problems(self.new_password)
        if problems:
            raise ValueError(" ".join(problems))
        if self.new_password == self.current_password:
            raise ValueError("New password must differ from the current password.")
        return self


class UpdateProfileRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name is required")
        return v


class DeleteAccountRequest(BaseModel):
    password: str = Field(max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class SessionOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    user_agent: str | None
    ip: str | None
    current: bool


class MessageOut(BaseModel):
    message: str
