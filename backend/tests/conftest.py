import copy
import os
import tempfile

# Configure the app BEFORE it is imported anywhere.
_TEST_URL = os.environ.get("TEST_DATABASE_URL") or \
    f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ.update({
    "ENVIRONMENT": "test",
    "DATABASE_URL": _TEST_URL,
    "ARGON2_TIME_COST": "1", "ARGON2_MEMORY_COST": "8", "ARGON2_PARALLELISM": "1",
    "EMAIL_BACKEND": "console",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import session as dbsession  # noqa: E402
from app.db.base import Base  # noqa: E402

VALID_CUSTOMER = {
    "gender": "Male", "SeniorCitizen": 0, "Partner": "Yes", "Dependents": "No",
    "tenure": 12, "PhoneService": "Yes", "MultipleLines": "No",
    "InternetService": "DSL", "OnlineSecurity": "No", "OnlineBackup": "Yes",
    "DeviceProtection": "No", "TechSupport": "No", "StreamingTV": "No",
    "StreamingMovies": "No", "Contract": "Month-to-month",
    "PaperlessBilling": "Yes", "PaymentMethod": "Electronic check",
    "MonthlyCharges": 70.5, "TotalCharges": 850.0,
}
PASSWORD = "Sturdy-pass-2026"
IS_PG = _TEST_URL.startswith("postgres")


@pytest.fixture(scope="session", autouse=True)
def _database():
    import app.models  # noqa: F401
    engine = dbsession.init_engine(
        _TEST_URL.replace("postgresql://", "postgresql+psycopg://", 1)
        if IS_PG else _TEST_URL)
    if IS_PG:
        with engine.begin() as c:
            c.execute(text("drop schema public cascade"))
            c.execute(text("create schema public"))
        from alembic import command
        from alembic.config import Config
        cfg = Config("alembic.ini")
        # env.py falls back to settings.sqlalchemy_url (= DATABASE_URL)
        command.upgrade(cfg, "head")
    else:
        Base.metadata.create_all(engine)
    yield engine


@pytest.fixture(autouse=True)
def _clean(_database):
    yield
    names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with _database.begin() as c:
        if IS_PG:
            c.execute(text(f"truncate {names} restart identity cascade"))
        else:
            for t in reversed(Base.metadata.sorted_tables):
                c.execute(t.delete())


@pytest.fixture
def customer():
    return copy.deepcopy(VALID_CUSTOMER)


@pytest.fixture
def outbox(monkeypatch):
    """Capture emails/tokens instead of sending."""
    box = []
    for mod, name in (("app.api.v1.auth", "send_reset_email"),
                      ("app.api.v1.auth", "send_verify_email"),
                      ("app.api.v1.admin", "send_reset_email")):
        monkeypatch.setattr(f"{mod}.{name}",
                            lambda to, token, _n=name: box.append((_n, to, token)))
    return box


@pytest.fixture
def app_client():
    from app.main import app
    with TestClient(app) as c:
        yield c


def new_client():
    from app.main import app
    return TestClient(app)


def make_user(email, role="analyst", name="Test User", password=PASSWORD, active=True,
              viewer_of=None):
    from app.core.security import hash_password
    from app.models import User
    with dbsession.SessionLocal() as db:
        u = User(name=name, email=email, password_hash=hash_password(password), role=role,
                 is_active=active, email_verified=True, viewer_of_id=viewer_of)
        db.add(u)
        db.commit()
        return u.id


def login(client, email, password=PASSWORD, remember=False):
    r = client.post("/api/v1/auth/login",
                    json={"email": email, "password": password, "remember_me": remember})
    assert r.status_code == 200, r.text
    client.headers["X-CSRF-Token"] = client.cookies.get("churn_csrf")
    return r.json()


@pytest.fixture
def make_client():
    """Factory: an authenticated client for a freshly created user."""
    clients = []

    def _make(email, role="analyst", **kw):
        uid = make_user(email, role, **kw)
        c = new_client()
        login(c, email)
        clients.append(c)
        c.user_id = uid
        return c
    yield _make
    for c in clients:
        c.close()
