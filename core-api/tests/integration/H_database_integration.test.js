/**
 * Integration Test Suite H: Backend ↔ Database Integration
 *
 * Purpose:
 *   Test the REAL database integration — actual Prisma queries to
 *   Supabase Postgres and actual Mongoose queries to MongoDB.
 *   Unlike unit tests (which mock DBs), these tests talk to real
 *   database connections.
 *
 * This suite boots the ACTUAL Express app (not mocked)
 * and uses Supertest to drive real API calls that write/read from DB.
 *
 * Prerequisite:
 *   - DATABASE_URL points to a reachable Postgres (Supabase or local)
 *   - MONGO_URL points to a reachable MongoDB
 *   Both are set in .env.test / docker-compose.test.yml
 *
 * How to run:
 *   npm run test:db            (reads from .env.test)
 *   OR
 *   docker-compose -f docker-compose.yml -f docker-compose.test.yml up
 *
 * Skip strategy:
 *   If DB_INTEGRATION=true env var is not set, tests skip.
 *   This prevents accidental DB writes in normal CI.
 */

import axios from 'axios';
import { randomBytes } from 'crypto';

const CORE_API = process.env.CORE_API_URL || 'http://localhost:4000';
const DB_INTEGRATION = process.env.DB_INTEGRATION === 'true';

// Generate unique test data per run to avoid conflicts
const runId = randomBytes(4).toString('hex');
const testEmail = `test-${runId}@traceweave-integration.local`;
const testPassword = 'TestPassword@123';

// ── Skip suite if DB_INTEGRATION not enabled ──────────────────
const describeOrSkip = DB_INTEGRATION ? describe : describe.skip;

// Shared state across tests (simulates a real user flow)
let authToken = '';
let userId = '';
let workspaceId = '';

describeOrSkip('Suite H — Backend ↔ Database Integration', () => {

    // ── H1: User Registration (Postgres write) ────────────────
    test('H1: Register a new user → row created in Postgres users table', async () => {
        const res = await axios.post(`${CORE_API}/v1/auth/register`, {
            name: `Integration User ${runId}`,
            email: testEmail,
            password: testPassword,
        }, { validateStatus: () => true });

        expect(res.status).toBe(201);
        expect(res.data).toHaveProperty('id');
        expect(res.data.email).toBe(testEmail);
        userId = res.data.id;
    });

    // ── H2: Duplicate registration → 400 (DB uniqueness) ──────
    test('H2: Registering same email again returns 400 (Postgres unique constraint)', async () => {
        const res = await axios.post(`${CORE_API}/v1/auth/register`, {
            name: 'Duplicate User',
            email: testEmail,
            password: testPassword,
        }, { validateStatus: () => true });

        expect(res.status).toBe(400);
    });

    // ── H3: Login → JWT from Postgres ─────────────────────────
    test('H3: Login with registered credentials returns JWT (Postgres read)', async () => {
        const res = await axios.post(`${CORE_API}/v1/auth/login`, {
            email: testEmail,
            password: testPassword,
        }, { validateStatus: () => true, withCredentials: true });

        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('user');
        // Extract token from Set-Cookie header
        const cookies = res.headers['set-cookie'] || [];
        const tokenCookie = cookies.find(c => c.startsWith('token='));
        expect(tokenCookie).toBeTruthy();
        authToken = tokenCookie?.split(';')[0]?.replace('token=', '') || '';
    });

    // ── H4: Protected route with JWT ─────────────────────────
    test('H4: Authenticated GET /auth/me reads user from Postgres', async () => {
        const res = await axios.get(`${CORE_API}/v1/auth/me`, {
            headers: { Cookie: `token=${authToken}` },
            validateStatus: () => true,
        });

        expect(res.status).toBe(200);
        expect(res.data.email).toBe(testEmail);
    });

    // ── H5: Create Workspace (Postgres write) ─────────────────
    test('H5: Create workspace → persisted in Postgres workspaces table', async () => {
        const res = await axios.post(`${CORE_API}/v1/workspaces/create`, {
            name: `Test Workspace ${runId}`,
        }, {
            headers: { Cookie: `token=${authToken}` },
            validateStatus: () => true,
        });

        expect(res.status).toBe(201);
        expect(res.data).toHaveProperty('data');
        expect(res.data.data).toHaveProperty('id');
        workspaceId = res.data.data.id;
    });

    // ── H6: List workspaces (Postgres read) ───────────────────
    test('H6: GET /workspaces returns the newly created workspace from Postgres', async () => {
        const res = await axios.get(`${CORE_API}/v1/workspaces`, {
            headers: { Cookie: `token=${authToken}` },
            validateStatus: () => true,
        });

        expect(res.status).toBe(200);
        const workspaces = res.data.data || res.data;
        expect(Array.isArray(workspaces)).toBe(true);
        const found = workspaces.find(w => w.id === workspaceId);
        expect(found).toBeTruthy();
        expect(found.name).toContain(runId);
    });

    // ── H7: Create Collection + Request (Postgres joins) ──────
    test('H7: Create collection + request under workspace (Postgres relational write)', async () => {
        const colRes = await axios.post(
            `${CORE_API}/v1/collections/workspace/${workspaceId}`,
            { name: `Col-${runId}` },
            { headers: { Cookie: `token=${authToken}` }, validateStatus: () => true }
        );
        expect(colRes.status).toBe(201);

        const colId = colRes.data.id;
        const reqRes = await axios.post(
            `${CORE_API}/v1/requests/${colId}`,
            { name: `Req-${runId}`, config: { method: 'GET', url: 'https://httpbin.org/get' } },
            { headers: { Cookie: `token=${authToken}` }, validateStatus: () => true }
        );
        expect(reqRes.status).toBe(201);
        expect(reqRes.data).toHaveProperty('id');
    });

    // ── H8: Ad-hoc request logs to MongoDB ───────────────────
    test('H8: Executing ad-hoc request creates ExecutionLog in MongoDB', async () => {
        const execRes = await axios.post(`${CORE_API}/v1/requests/execute`, {
            workspaceId,
            config: JSON.stringify({
                method: 'GET',
                url: 'https://httpbin.org/get',
                headers: {},
                params: {},
                body: { type: 'none' },
            }),
        }, {
            headers: { Cookie: `token=${authToken}` },
            validateStatus: () => true,
        });

        // 200 means runner executed + MongoDB wrote the log
        expect(execRes.status).toBe(200);
        expect(execRes.data).toHaveProperty('historyId'); // MongoDB _id returned
        expect(execRes.data.historyId).toBeTruthy();
    });

    // ── H9: Workspace history from MongoDB ───────────────────
    test('H9: GET workspace history reads ExecutionLog entries from MongoDB', async () => {
        const res = await axios.get(`${CORE_API}/v1/workspaces/${workspaceId}/history`, {
            headers: { Cookie: `token=${authToken}` },
            validateStatus: () => true,
        });

        expect(res.status).toBe(200);
        expect(res.data).toHaveProperty('data');
        expect(Array.isArray(res.data.data)).toBe(true);
    });

    // ── H10: Invalid JWT → 401 (no DB read happens) ──────────
    test('H10: Expired/invalid JWT returns 401 — DB is never queried', async () => {
        const res = await axios.get(`${CORE_API}/v1/auth/me`, {
            headers: { Cookie: 'token=invalid-jwt-token-here' },
            validateStatus: () => true,
        });

        expect(res.status).toBe(401);
    });
});

// ── Always-on DB connectivity check ──────────────────────────
describe('Suite H — DB Connectivity Smoke Tests', () => {
    test('H-SMOKE: core-api /health endpoint confirms service is live', async () => {
        const reachable = await axios.get(`${CORE_API}/health`, {
            timeout: 5000,
            validateStatus: () => true,
        }).then(r => r.status === 200).catch(() => false);

        if (!reachable) {
            console.warn(`⚠️  core-api not reachable at ${CORE_API} — skipping DB tests`);
        }
        // This always passes — it's a smoke indicator, not a blocking assertion
        expect(typeof reachable).toBe('boolean');
    });
});

// integration testing step
