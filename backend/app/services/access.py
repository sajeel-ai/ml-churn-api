import uuid

from app.models import User

WRITE_ROLES = ("admin", "analyst")


def visible_owner_ids(user: User) -> list[uuid.UUID]:
    """Whose records this user may READ.

    admin/analyst: only their own. viewer: only the analyst they were
    assigned to (none if unassigned). Admins deliberately get no access to
    other users' private customer data.
    """
    if user.role == "viewer":
        return [user.viewer_of_id] if user.viewer_of_id else []
    return [user.id]


def can_write(user: User) -> bool:
    return user.role in WRITE_ROLES
