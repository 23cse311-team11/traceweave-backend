/**
 * Real Integration Test Suite 04: API Execution → MongoDB Pipeline
 *
 * Tests execution pipeline with REAL MongoDB (in-memory):
 *   - Ad-hoc request execution writes ExecutionLog to real MongoDB
 *   - Failed responses still logged
 *   - Multiple executions create separate documents
 *   - Unauthenticated requests blocked at auth layer
 *
 * HTTP runner is mocked (external network call). Everything else is real:
 *   Real Express app, auth middleware, RBAC, controllers, services,
 *   and real Mongoose writes to in-memory MongoDB.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import {
    buildApp,
    startMongo,
    stopMongo,
    clearMongo,
    uniqueEmail,
    mockPrisma,
    mockExecuteHttpRequest,
    clearPrismaStore,
} from './setup.integration.js';

let app;

beforeAll(async () => {
    await startMongo();
    app = buildApp();
}, 30000);

afterAll(async () => {
    clearPrismaStore();
    await clearMongo();
    await stopMongo();
}, 15000);

afterEach(() => {
    jest.clearAllMocks();
});

// ── Helper ───────────────────────────────────────────────────────
async function registerLoginAndSetup(appInstance) {
    const email = uniqueEmail();
    const password = 'TestPass@123';

    const regRes = await request(appInstance)
        .post('/v1/auth/register')
        .send({ name: 'Exec Test User', email, password });

    const cookie = regRes.headers['set-cookie']
        .find((c) => c.startsWith('token='))
        .split(';')[0];

    const meRes = await request(appInstance)
        .get('/v1/auth/me')
        .set('Cookie', cookie);

    // Create workspace
    const wsRes = await request(appInstance)
        .post('/v1/workspaces/create')
        .set('Cookie', cookie)
        .send({ name: 'Execution Test WS' });

    return {
        cookie,
        userId: meRes.body.user.id,
        email,
        workspaceId: wsRes.body.data.id,
    };
}

// ── Tests ────────────────────────────────────────────────────────

describe('Real Integration 04 — API Execution → MongoDB Pipeline', () => {
    let cookie, userId, workspaceId;

    beforeAll(async () => {
        clearPrismaStore();
        const setup = await registerLoginAndSetup(app);
        cookie = setup.cookie;
        userId = setup.userId;
        workspaceId = setup.workspaceId;
    }, 30000);

    // ── 04.1: Ad-hoc execution saves to real MongoDB ──────────────
    test('04.1: POST /v1/requests/execute saves ExecutionLog to MongoDB', async () => {
        mockExecuteHttpRequest.mockResolvedValue({
            success: true,
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            data: { message: 'Hello World' },
            size: 256,
            timings: {
                dnsLookup: 5, tcpConnection: 10, tlsHandshake: 15,
                firstByte: 30, download: 8, total: 68,
            },
            cookies: {},
        });

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', cookie)
            .send({
                workspaceId,
                config: JSON.stringify({
                    method: 'GET',
                    url: 'https://api.example.com/data',
                    headers: {}, params: {},
                    body: { type: 'none' },
                }),
            });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe(200);
        expect(res.body.historyId).toBeTruthy();

        // Verify ExecutionLog actually saved in real MongoDB
        const ExecutionLog = mongoose.connection.collection('executionlogs');
        const logs = await ExecutionLog.find({ workspaceId }).toArray();
        expect(logs.length).toBeGreaterThanOrEqual(1);

        const log = logs[0];
        expect(log.method).toBe('GET');
        expect(log.url).toBe('https://api.example.com/data');
        expect(log.status).toBe(200);
        expect(log.timings.total).toBe(68);
    }, 15000);

    // ── 04.2: Failed response also logged ─────────────────────────
    test('04.2: Failed downstream response (503) is logged to MongoDB', async () => {
        mockExecuteHttpRequest.mockResolvedValue({
            success: false, status: 503, statusText: 'Service Unavailable',
            headers: {}, data: { error: 'Backend overloaded' }, size: 50,
            timings: { dnsLookup: 3, tcpConnection: 5, tlsHandshake: 0, firstByte: 2000, download: 2, total: 2010 },
            cookies: {},
        });

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', cookie)
            .send({
                workspaceId,
                config: JSON.stringify({
                    method: 'POST',
                    url: 'https://api.example.com/heavy-endpoint',
                    headers: {}, params: {},
                    body: { type: 'none' },
                }),
            });

        expect(res.status).toBe(200); // Our API returns 200 — 503 is the target's status
        expect(res.body.status).toBe(503);

        const ExecutionLog = mongoose.connection.collection('executionlogs');
        const failLog = await ExecutionLog.findOne({ url: 'https://api.example.com/heavy-endpoint' });
        expect(failLog).not.toBeNull();
        expect(failLog.status).toBe(503);
    }, 15000);

    // ── 04.3: Multiple executions ─────────────────────────────────
    test('04.3: 3 sequential executions create 3 separate MongoDB entries', async () => {
        await clearMongo(); // Start fresh for counting

        mockExecuteHttpRequest.mockResolvedValue({
            success: true, status: 200, statusText: 'OK',
            headers: {}, data: {}, size: 10,
            timings: { dnsLookup: 1, tcpConnection: 2, tlsHandshake: 0, firstByte: 5, download: 1, total: 9 },
            cookies: {},
        });

        for (let i = 0; i < 3; i++) {
            await request(app)
                .post('/v1/requests/execute')
                .set('Cookie', cookie)
                .send({
                    workspaceId,
                    config: JSON.stringify({
                        method: 'GET',
                        url: `https://api.example.com/batch/${i}`,
                        headers: {}, params: {},
                        body: { type: 'none' },
                    }),
                });
        }

        const ExecutionLog = mongoose.connection.collection('executionlogs');
        const count = await ExecutionLog.countDocuments({ workspaceId });
        expect(count).toBe(3);
    }, 20000);

    // ── 04.4: Unauthenticated blocked ─────────────────────────────
    test('04.4: POST /v1/requests/execute without auth returns 401', async () => {
        const res = await request(app)
            .post('/v1/requests/execute')
            .send({
                workspaceId,
                config: JSON.stringify({
                    method: 'GET', url: 'https://should-not-execute.com',
                    headers: {}, params: {}, body: { type: 'none' },
                }),
            });

        expect(res.status).toBe(401);
        expect(mockExecuteHttpRequest).not.toHaveBeenCalled();
    });

    // ── 04.5: Health endpoint ─────────────────────────────────────
    test('04.5: GET /health returns 200 (smoke test)', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('OK');
    });
});
