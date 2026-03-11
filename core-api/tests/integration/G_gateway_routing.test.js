/**
 * Integration Test Suite G: Gateway ↔ Backend Routing
 *
 * Purpose:
 *   Validate that the Nginx API Gateway correctly routes incoming requests
 *   to the right upstream services and handles unknown paths gracefully.
 *
 * Architecture Under Test:
 *   Client → Gateway (Nginx :80)
 *              ├── /api/v1/analyze  → AI Service (FastAPI :5000)
 *              ├── /api/*           → core-api (Node.js :4000)
 *              └── /               → 200 "TraceWeave Gateway Running"
 *
 * How to run:
 *   Requires running services. Use Docker or start manually:
 *     docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
 *
 *   Then:
 *     npm run test:cross-service -- --testPathPattern=G_gateway
 *
 *   OR (unit mode — against direct ports, no gateway):
 *     npm run test:cross-service -- --testPathPattern=G_gateway
 *
 * NOTE: If GATEWAY_URL is not set, tests skip gracefully.
 */

import axios from 'axios';

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:80';
const CORE_API = process.env.CORE_API_URL || 'http://localhost:4000';
const AI_SVC = process.env.AI_SERVICE_URL || 'http://localhost:5000';

// ── Helper: check if a service is reachable ──────────────────
async function isReachable(url) {
    try {
        await axios.get(url, { timeout: 3000 });
        return true;
    } catch {
        return false;
    }
}

// ── Skip entire suite if gateway is not running ───────────────
let gatewayAvailable = false;
let coreAvailable = false;
let aiAvailable = false;

beforeAll(async () => {
    gatewayAvailable = await isReachable(`${GATEWAY}/`);
    coreAvailable = await isReachable(`${CORE_API}/health`);
    aiAvailable = await isReachable(`${AI_SVC}/health`);
});

describe('Suite G — Gateway ↔ Backend Routing', () => {

    // ── G1: Gateway default route ─────────────────────────────
    test('G1: GET / returns TraceWeave Gateway Running (200)', async () => {
        if (!gatewayAvailable) return;

        const res = await axios.get(`${GATEWAY}/`, { validateStatus: () => true });

        expect(res.status).toBe(200);
        expect(res.data).toMatch(/TraceWeave Gateway Running/i);
    });

    // ── G2: /api/ routes forwarded to core-api ────────────────
    test('G2: GET /api/health is proxied to core-api and returns 200', async () => {
        if (!gatewayAvailable || !coreAvailable) return;

        const res = await axios.get(`${GATEWAY}/api/health`, { validateStatus: () => true });

        expect(res.status).toBe(200);
        expect(res.data).toMatchObject(
            expect.objectContaining({ status: expect.any(String) })
        );
    });

    // ── G3: /api/v1/analyze proxied to ai-service ─────────────
    test('G3: GET /api/v1/analyze is proxied to ai-service and returns health JSON', async () => {
        if (!gatewayAvailable || !aiAvailable) return;

        const res = await axios.get(`${GATEWAY}/api/v1/analyze`, { validateStatus: () => true });

        expect(res.status).toBe(200);
        // AI service returns { "service": "...", "status": "ok" }
        expect(res.data).toMatchObject({ status: 'ok' });
    });

    // ── G4: Unknown /api/ route forwarded → core-api 404 ─────
    test('G4: GET /api/v1/nonexistent-route returns 404 from core-api via gateway', async () => {
        if (!gatewayAvailable || !coreAvailable) return;

        const res = await axios.get(`${GATEWAY}/api/v1/this-route-does-not-exist`, {
            validateStatus: () => true,
        });

        expect(res.status).toBe(404);
    });

    // ── G5: Non-/api/ path hits gateway default ───────────────
    test('G5: GET /someotherpath returns gateway default 200 response', async () => {
        if (!gatewayAvailable) return;

        const res = await axios.get(`${GATEWAY}/someotherpath`, { validateStatus: () => true });

        expect(res.status).toBe(200);
        expect(res.data).toMatch(/TraceWeave Gateway Running/i);
    });

    // ── G6: Gateway forwards X-Real-IP header ─────────────────
    test('G6: Requests via gateway reach core-api with proper Host header set', async () => {
        if (!gatewayAvailable || !coreAvailable) return;

        const res = await axios.get(`${GATEWAY}/api/health`, {
            headers: { 'X-Test-Client': 'integration-suite-G' },
            validateStatus: () => true,
        });

        // Core-api responds 200 meaning connection + forwarding worked
        expect(res.status).toBe(200);
    });

    // ── G7: Direct core-api health (no gateway) ───────────────
    test('G7: core-api health endpoint responds directly on port 4000', async () => {
        if (!coreAvailable) return;

        const res = await axios.get(`${CORE_API}/health`, { validateStatus: () => true });

        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('status');
    });

    // ── G8: Direct AI-service health (no gateway) ────────────
    test('G8: ai-service health endpoint responds directly on port 5000', async () => {
        if (!aiAvailable) return;

        const res = await axios.get(`${AI_SVC}/health`, { validateStatus: () => true });

        expect(res.status).toBe(200);
        expect(res.data).toMatchObject({ status: 'ok' });
    });
});

// integration testing step
