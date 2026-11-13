from types import SimpleNamespace

from app.core.config import settings
from app.services.audit import client_ip


def req(xff=None, peer="10.0.0.5"):
    headers = {"x-forwarded-for": xff} if xff else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=peer))


def test_ignores_forwarded_header_unless_trusted(monkeypatch):
    monkeypatch.setattr(settings, "trust_proxy_headers", False)
    assert client_ip(req("6.6.6.6")) == "10.0.0.5"


def test_spoofed_prefix_cannot_override_real_client(monkeypatch):
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    # attacker sends "6.6.6.6"; the load balancer appends the address it really saw
    assert client_ip(req("6.6.6.6, 198.51.100.9")) == "198.51.100.9"


def test_two_appending_proxies(monkeypatch):
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    monkeypatch.setattr(settings, "trusted_proxy_hops", 2)
    # attacker prefix, real client (added by proxy A), proxy A's address (added by proxy B)
    assert client_ip(req("6.6.6.6, 198.51.100.9, 10.1.1.1")) == "198.51.100.9"


def test_falls_back_to_peer_when_header_too_short(monkeypatch):
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    monkeypatch.setattr(settings, "trusted_proxy_hops", 3)
    assert client_ip(req("198.51.100.9")) == "10.0.0.5"
    assert client_ip(req(None)) == "10.0.0.5"
