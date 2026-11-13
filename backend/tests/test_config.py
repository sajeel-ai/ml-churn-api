import pytest

from app.core.config import Settings


def test_production_requires_secure_cookies():
    with pytest.raises(ValueError, match="COOKIE_SECURE"):
        Settings(environment="production", cookie_secure=False,
                 database_url="postgresql://u:p@h/db")


def test_production_refuses_sqlite():
    with pytest.raises(ValueError, match="PostgreSQL"):
        Settings(environment="production", cookie_secure=True, database_url="sqlite:///x.db")


def test_production_defaults_are_locked_down():
    s = Settings(environment="production", cookie_secure=True, database_url="postgresql://u:p@h/db")
    assert s.legacy_enabled is False          # unauthenticated /predict is off
    assert s.sqlalchemy_url.startswith("postgresql+psycopg://")


def test_development_keeps_legacy_endpoints_and_converts_urls():
    s = Settings(environment="development", database_url="postgres://u:p@h/db")
    assert s.legacy_enabled is True
    assert s.sqlalchemy_url == "postgresql+psycopg://u:p@h/db"      # Render/Railway style URL
    assert Settings(environment="production", cookie_secure=True, legacy_endpoints_enabled=True,
                    database_url="postgresql://u:p@h/db").legacy_enabled is True


def test_origin_and_host_lists_are_parsed():
    s = Settings(allowed_origins="https://a.example/, https://b.example", allowed_hosts="api.example, localhost")
    assert s.origins == ["https://a.example", "https://b.example"]
    assert s.hosts == ["api.example", "localhost"]
