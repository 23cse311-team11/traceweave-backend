"""
Integration Test Suite: AI-Service Health Endpoint
Test IDs: PY-01 through PY-06

Runs against live ai-service container (Docker).
Uses the conftest.py fixtures for httpx clients.
"""
import pytest
import httpx
from conftest import AI_SERVICE_URL, GATEWAY_URL, is_reachable


# ── Skip if ai-service not reachable ──────────────────────────────────
pytestmark = pytest.mark.skipif(
    not is_reachable(f"{AI_SERVICE_URL}/health"),
    reason="ai-service not reachable — start Docker stack first: "
           "docker compose -f docker-compose.yml -f docker-compose.test.yml up --build",
)


class TestAiServiceHealthDirect:
    """PY-01 to PY-03: Direct ai-service health checks (port 5000)."""

    def test_py01_health_returns_200(self, ai_client):
        """
        PY-01: GET /health returns HTTP 200.
        Integration point: ai-service container responding on port 5000.
        """
        response = ai_client.get("/health")
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}. "
            "ai-service may not be running."
        )

    def test_py02_health_returns_json(self, ai_client):
        """
        PY-02: GET /health returns valid JSON body.
        Validates Content-Type header and JSON parsability.
        """
        response = ai_client.get("/health")
        assert response.status_code == 200
        assert "application/json" in response.headers.get("content-type", ""), (
            "Expected application/json content-type"
        )
        body = response.json()
        assert isinstance(body, dict), "Response body must be a JSON object"

    def test_py03_health_body_shape(self, ai_client):
        """
        PY-03: GET /health body contains 'service' and 'status' keys.
        Architecture contract: ai-service always returns {service, status}.
        """
        response = ai_client.get("/health")
        body = response.json()
        assert "service" in body, f"Missing 'service' key in: {body}"
        assert "status" in body, f"Missing 'status' key in: {body}"
        assert body["status"] == "ok", (
            f"Expected status='ok', got '{body['status']}'"
        )

    def test_py04_health_service_name_set(self, ai_client):
        """
        PY-04: The 'service' field is a non-empty string.
        Validates SERVICE_NAME env var is propagated into the container.
        """
        response = ai_client.get("/health")
        body = response.json()
        assert isinstance(body.get("service"), str), "'service' must be a string"
        assert len(body["service"]) > 0, "'service' must not be empty"

    def test_py05_health_unknown_route_returns_404(self, ai_client):
        """
        PY-05: GET /nonexistent returns 404 (FastAPI default).
        Validates FastAPI default error handling is in place.
        """
        response = ai_client.get("/nonexistent-endpoint-xyz")
        assert response.status_code == 404, (
            f"Expected 404 for unknown route, got {response.status_code}"
        )

    def test_py06_health_content_length_greater_than_zero(self, ai_client):
        """
        PY-06: Response body is non-empty (service returning content).
        Ensures the FastAPI app is running and emitting real data.
        """
        response = ai_client.get("/health")
        assert len(response.content) > 0, "Response body should not be empty"


class TestAiServiceGatewayProxy:
    """
    PY-07 to PY-10: ai-service accessed through Nginx gateway.
    Route: /api/v1/analyze → ai-service:5000
    Requires both gateway and ai-service to be healthy.
    """

    @pytest.fixture(autouse=True)
    def skip_if_gateway_down(self):
        if not is_reachable(f"{GATEWAY_URL}/"):
            pytest.skip("Nginx gateway not reachable — Docker stack not running")

    def test_py07_gateway_proxies_analyze_to_ai_service(self, gateway_client):
        """
        PY-07: GET /api/v1/analyze via gateway reaches ai-service.
        Validates Nginx upstream routing rule for /api/v1/analyze.
        """
        response = gateway_client.get("/api/v1/analyze")
        assert response.status_code == 200, (
            f"Gateway /api/v1/analyze should proxy to ai-service. Got {response.status_code}"
        )
        body = response.json()
        assert body.get("status") == "ok", (
            f"Expected ai-service status='ok', got: {body}"
        )

    def test_py08_gateway_analyze_returns_service_metadata(self, gateway_client):
        """
        PY-08: /api/v1/analyze response contains service identifier.
        Confirms ai-service is the responder (not core-api).
        """
        response = gateway_client.get("/api/v1/analyze")
        body = response.json()
        assert "service" in body, "Response should include 'service' field"

    def test_py09_gateway_api_routes_to_core_not_ai(self, gateway_client):
        """
        PY-09: GET /api/v1/health (no 'analyze') routes to core-api, not ai-service.
        Validates Nginx priority: /api/v1/analyze matches FIRST, rest → core-api.
        """
        response = gateway_client.get("/api/v1/health")
        assert response.status_code == 200
        body = response.json()
        # core-api health returns {status: 'OK', service: 'Core API'}
        # ai-service returns {status: 'ok', service: '...ai...'}
        service = body.get("service", "")
        assert "Core API" in service or body.get("status") == "OK", (
            f"/api/v1/health should reach core-api, got: {body}"
        )

    def test_py10_gateway_returns_200_on_root(self, gateway_client):
        """
        PY-10: GET / returns 200 with gateway running message.
        Validates Nginx default fallback route.
        """
        response = gateway_client.get("/")
        assert response.status_code == 200
        assert "TraceWeave" in response.text, (
            f"Gateway root should mention TraceWeave — got: {response.text[:200]}"
        )


class TestAiServiceFailureScenarios:
    """
    PY-11 to PY-13: Failure and edge case scenarios for ai-service.
    """

    def test_py11_post_to_health_returns_405_or_404(self, ai_client):
        """
        PY-11: POST /health is not a valid method — should return 405 or 404.
        Validates FastAPI does not accidentally accept wrong HTTP verbs.
        """
        response = ai_client.post("/health", json={})
        assert response.status_code in (405, 404, 422), (
            f"POST to GET-only endpoint should fail, got {response.status_code}"
        )

    def test_py12_large_path_does_not_crash_service(self, ai_client):
        """
        PY-12: Very long URL path does not crash the service (resilience).
        Service should return 4xx — not 500 or connection reset.
        """
        long_path = "/health/" + "a" * 500
        response = ai_client.get(long_path)
        assert response.status_code < 500, (
            f"Long path caused server error: {response.status_code}"
        )

    def test_py13_health_is_idempotent(self, ai_client):
        """
        PY-13: Multiple GET /health calls return identical status.
        Validates there is no state mutation on health calls.
        """
        responses = [ai_client.get("/health") for _ in range(3)]
        statuses = [r.status_code for r in responses]
        bodies = [r.json().get("status") for r in responses]

        assert all(s == 200 for s in statuses), f"Non-200 in repeated calls: {statuses}"
        assert len(set(bodies)) == 1, f"Status changed across calls: {bodies}"
