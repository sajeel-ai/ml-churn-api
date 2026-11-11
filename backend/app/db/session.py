from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = None
SessionLocal: sessionmaker | None = None


def init_engine(url: str | None = None):
    """(Re)configure the global engine. Tests call this with their own URL."""
    global engine, SessionLocal
    url = url or settings.sqlalchemy_url
    kwargs = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    if engine is not None:
        engine.dispose()
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _):  # enforce ON DELETE CASCADE in SQLite too
            dbapi_conn.execute("PRAGMA foreign_keys=ON")
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    return engine


def get_db():
    if SessionLocal is None:
        init_engine()
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
