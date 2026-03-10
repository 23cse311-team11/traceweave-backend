"""
TraceWeave AI-Service Integration Tests — Shared Fixtures
Runs inside Docker test stack (docker-compose.test.yml).
"""
import os
import pytest
import httpx


# ── Service URLs (resolved from Docker Compose environment) ──────────
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:5000")
GATEWAY_URL     = os.getenv("GATEWAY_URL",    "http://localhost:80")
CORE_API_URL    = os.getenv("CORE_API_URL",   "http://localhost:4000")

TIMEOUT = 10.0   # seconds


@pytest.fixture(scope="session")
def ai_client():
    """httpx client pointed directly at the ai-service container."""
    with httpx.Client(base_url=AI_SERVICE_URL, timeout=TIMEOUT) as client:
        yield client


@pytest.fixture(scope="session")
def gateway_client():
    """httpx client pointed at the Nginx gateway."""
    with httpx.Client(base_url=GATEWAY_URL, timeout=TIMEOUT) as client:
        yield client


@pytest.fixture(scope="session")
def core_client():
    """httpx client pointed directly at core-api."""
    with httpx.Client(base_url=CORE_API_URL, timeout=TIMEOUT) as client:
        yield client


def is_reachable(url: str) -> bool:
    """Return True if the service responds, False on any error."""
    try:
        r = httpx.get(url, timeout=3.0)
        return r.status_code < 500
    except Exception:
        return False
