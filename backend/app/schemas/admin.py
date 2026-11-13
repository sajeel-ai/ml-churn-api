import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class AdminCreateUser(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    role: Literal["admin", "analyst", "viewer"] = "analyst"


class RoleUpdate(BaseModel):
    role: Literal["admin", "analyst", "viewer"]


class StatusUpdate(BaseModel):
    is_active: bool


class ViewerAssignment(BaseModel):
    viewer_of_id: uuid.UUID | None


class AuditLogOut(BaseModel):
    id: int
    created_at: datetime
    actor_id: uuid.UUID | None
    actor_name: str | None
    action: str
    resource_type: str | None
    resource_id: str | None
    ip: str | None
    details: dict | None
