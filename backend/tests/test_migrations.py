import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from app.db import session as dbsession
from app.db.base import Base
from tests.conftest import IS_PG


@pytest.mark.skipif(not IS_PG, reason="schema is built from migrations only on PostgreSQL")
def test_models_match_migrations():
    import app.models  # noqa: F401
    with dbsession.engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn, opts={"compare_type": True}),
                                Base.metadata)
    assert diff == [], f"models and migrations differ: {diff}"
