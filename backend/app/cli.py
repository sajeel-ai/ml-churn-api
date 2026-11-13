"""Operator commands.  Usage (from backend/):

    python -m app.cli create-admin --email you@example.com --name "Your Name"
    python -m app.cli set-role --email someone@example.com --role analyst

The password is read with a hidden prompt (or the ADMIN_PASSWORD env var for
automation); it is never accepted as a command-line argument.
"""
import argparse
import getpass
import os
import sys

from sqlalchemy import select

from app.core.security import hash_password, password_problems
from app.db import session as dbsession
from app.models import User
from app.services import audit


def _db():
    if dbsession.SessionLocal is None:
        dbsession.init_engine()
    return dbsession.SessionLocal()


def create_admin(email: str, name: str, password: str | None = None) -> int:
    email = email.strip().lower()
    password = password or os.environ.get("ADMIN_PASSWORD")
    if not password:
        password = getpass.getpass("Password: ")
        if password != getpass.getpass("Confirm password: "):
            print("Passwords do not match.")
            return 1
    problems = password_problems(password, email, name)
    if problems:
        print("Password rejected: " + " ".join(problems))
        return 1
    with _db() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.role, user.is_active, user.email_verified = "admin", True, True
            user.password_hash = hash_password(password)
            action = "promoted"
        else:
            user = User(name=name, email=email, password_hash=hash_password(password),
                        role="admin", is_active=True, email_verified=True)
            db.add(user)
            action = "created"
        db.commit()
        audit.record(db, "admin_provisioned_cli", resource_type="user", resource_id=user.id,
                     details={"result": action})
    print(f"Admin {action}: {email}")
    return 0


def set_role(email: str, role: str) -> int:
    with _db() as db:
        user = db.scalar(select(User).where(User.email == email.strip().lower()))
        if not user:
            print("No such user.")
            return 1
        user.role = role
        if role != "viewer":
            user.viewer_of_id = None
        db.commit()
        audit.record(db, "role_changed_cli", resource_type="user", resource_id=user.id,
                     details={"to": role})
    print(f"{email} is now {role}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("create-admin")
    a.add_argument("--email", required=True)
    a.add_argument("--name", required=True)
    r = sub.add_parser("set-role")
    r.add_argument("--email", required=True)
    r.add_argument("--role", required=True, choices=["admin", "analyst", "viewer"])
    args = p.parse_args(argv)
    if args.cmd == "create-admin":
        return create_admin(args.email, args.name)
    return set_role(args.email, args.role)


if __name__ == "__main__":
    sys.exit(main())
