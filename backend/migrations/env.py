from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import settings
from app.db.base import Base
import app.models  # noqa: F401  (register tables)

config = context.config
target_metadata = Base.metadata


def _url():
    return config.get_main_option("sqlalchemy.url") or settings.sqlalchemy_url


def run_migrations_offline():
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True,
                      compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
                          compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
