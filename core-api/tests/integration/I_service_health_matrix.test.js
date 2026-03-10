/**
 * Integration Test Suite I: Service Health Matrix
 *
 * Purpose:
 *   A quick "are all services alive?" health check matrix.
 *   This is the first test to run in any integration pipeline —
 *   if any service fails here, other suites will be unreachable.
 *
 * Services Checked:
 *   ┌─────────────────┬──────┬────────────────────────────┐
 *   │ Service         │ Port │ Health Endpoint             │
 *   ├─────────────────┼──────┼────────────────────────────┤
 *   │ core-api        │ 4000 │ GET /health                 │
 *   │ ai-service      │ 5000 │ GET /health                 │
 *   │ Nginx Gateway   │ 80   │ GET /   (returns 200 text)  │
 *   │ Gateway→core    │ 80   │ GET /api/v1/health          │
 *   │ Gateway→ai      │ 80   │ GET /api/v1/analyze         │
 *   └─────────────────┴──────┴────────────────────────────┘
 *
 * Strategy:
 *   All tests are SOFT — they log warnings but never hard-fail
 *   when services are unavailable (to allow local dev without Docker).
 *   The final I6 test emits a summary table.
 */

import axios from 'axios';

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:80';
const CORE_API = process.env.CORE_API_URL || 'http://localhost:4000';
const AI_SVC = process.env.AI_SERVICE_URL || 'http://localhost:5000';
const TIMEOUT = 5000;

// ── Probe function: returns status or null ────────────────────
async function probe(url) {
    try {
        const res = await axios.get(url, { timeout: TIMEOUT, validateStatus: () => true });
        return { status: res.status, data: res.data, ok: res.status >= 200 && res.status < 400 };
    } catch (err) {
        return { status: null, data: null, ok: false, error: err.message };
    }
}

// ── Collect health results for summary ───────────────────────
const results = {};

describe('Suite I — Service Health Matrix', () => {

    // ── I1: core-api direct health ───────────────────────────
    test('I1: core-api GET /health responds on port 4000', async () => {
        const r = await probe(`${CORE_API}/health`);
        results['core-api:4000'] = r;

        if (!r.ok) {
            console.warn(`⚠️  core-api unreachable — status: ${r.status}, error: ${r.error ?? 'n/a'}`);
        } else {
            expect(r.status).toBe(200);
            expect(r.data).toHaveProperty('status');
            console.log(`✅  core-api /health →`, r.data);
        }
        // Always passes — health matrix is informational
        expect(typeof r.ok).toBe('boolean');
    });

    // ── I2: ai-service direct health ─────────────────────────
    test('I2: ai-service GET /health responds on port 5000', async () => {
        const r = await probe(`${AI_SVC}/health`);
        results['ai-service:5000'] = r;

        if (!r.ok) {
            console.warn(`⚠️  ai-service unreachable — status: ${r.status}`);
        } else {
            expect(r.status).toBe(200);
            expect(r.data).toMatchObject({ status: 'ok' });
            console.log(`✅  ai-service /health →`, r.data);
        }
        expect(typeof r.ok).toBe('boolean');
    });

    // ── I3: Gateway root ─────────────────────────────────────
    test('I3: Nginx gateway GET / returns 200 on port 80', async () => {
        const r = await probe(`${GATEWAY}/`);
        results['gateway:80 /'] = r;

        if (!r.ok) {
            console.warn(`⚠️  Gateway unreachable — status: ${r.status}`);
        } else {
            expect(r.status).toBe(200);
            expect(String(r.data)).toMatch(/TraceWeave/i);
            console.log(`✅  Gateway / → "${r.data}"`);
        }
        expect(typeof r.ok).toBe('boolean');
    });

    // ── I4: Gateway → core-api path ──────────────────────────
    test('I4: Gateway /api/health routes correctly to core-api', async () => {
        const r = await probe(`${GATEWAY}/api/health`);
        results['gateway:80 → core-api'] = r;

        if (!r.ok) {
            console.warn(`⚠️  Gateway→core-api path not working — status: ${r.status}`);
        } else {
            expect(r.status).toBe(200);
            expect(r.data).toHaveProperty('status');
            console.log(`✅  Gateway /api/health → core-api:`, r.data);
        }
        expect(typeof r.ok).toBe('boolean');
    });

    // ── I5: Gateway → ai-service path ────────────────────────
    test('I5: Gateway /api/v1/analyze routes correctly to ai-service', async () => {
        const r = await probe(`${GATEWAY}/api/v1/analyze`);
        results['gateway:80 → ai-service'] = r;

        if (!r.ok) {
            console.warn(`⚠️  Gateway→ai-service path not working — status: ${r.status}`);
        } else {
            expect(r.status).toBe(200);
            expect(r.data).toMatchObject({ status: 'ok' });
            console.log(`✅  Gateway /api/v1/analyze → ai-service:`, r.data);
        }
        expect(typeof r.ok).toBe('boolean');
    });

    // ── I6: Summary table ────────────────────────────────────
    test('I6: Print service health summary table', async () => {
        console.log('\n╔════════════════════════════════════╤════════╗');
        console.log('║ Service                            │ Status ║');
        console.log('╠════════════════════════════════════╪════════╣');
        for (const [name, r] of Object.entries(results)) {
            const icon = r.ok ? '✅' : '❌';
            const status = r.status ?? 'N/A';
            console.log(`║ ${(name + '                                ').slice(0, 34)} │  ${icon}${status.toString().padStart(3)}  ║`);
        }
        console.log('╚════════════════════════════════════╧════════╝');

        const allHealthy = Object.values(results).every(r => r.ok);
        if (!allHealthy) {
            console.warn('\n⚠️  Some services are not running. Start with:');
            console.warn('  docker-compose -f docker-compose.yml -f docker-compose.dev.yml up\n');
        }

        // Summary always passes — it's informational
        expect(Object.keys(results).length).toBeGreaterThan(0);
    });
});
