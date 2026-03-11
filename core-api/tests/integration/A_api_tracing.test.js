/**
 * Integration Test Suite A: API ↔ Distributed Tracing
 *
 * Purpose:
 *   Validate that API calls generate proper trace spans (traceId, timing metadata),
 *   that concurrent requests produce unique trace entries, and that error responses
 *   (5xx, network failures) are captured in ExecutionLog (MongoDB).
 *
 * Coverage:
 *   - POST /v1/requests/execute → ExecutionLog is created with timing data
 *   - Concurrent requests produce separate distinct log entries
 *   - Downstream errors (5xx): trace records failure status, not re-thrown
 *   - Network errors (status 0) are captured
 *   - 401 without auth → no trace created, no HTTP call made
 *
 * NOTE: The executeAdHocRequest endpoint reads config from req.body.config (JSON string or object).
 *       workspaceId must be >= 5 characters. Member check is done inline in the controller.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ─── DB / Infrastructure Mocks ────────────────────────────────
const mockExecutionLog = { create: jest.fn() };
const mockPrisma = {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    cookie: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
};

// jest.unstable_mockModule('../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../src/config/mongo.js', () => ({ default: jest.fn().mockResolvedValue(true) }));
jest.unstable_mockModule('../../src/models/execution.model.js', () => ({ default: mockExecutionLog }));
jest.unstable_mockModule('../../src/models/workflow-log.model.js', () => ({ default: { create: jest.fn() } }));
// CookieJarModel is a Mongoose model used by cookie.service.js's loadCookieJar
jest.unstable_mockModule('../../src/models/cookie-jar.model.js', () => ({
    default: {
        find: jest.fn().mockResolvedValue([]),
        findOneAndUpdate: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
    },
}));
jest.unstable_mockModule('nodemailer', () => ({
    default: { createTransport: jest.fn().mockReturnValue({ sendMail: jest.fn(), verify: jest.fn((cb) => cb(null, true)) }) },
}));
jest.unstable_mockModule('pg', () => ({ default: { Pool: jest.fn().mockImplementation(() => ({})) } }));
jest.unstable_mockModule('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn().mockImplementation(() => ({})) }));
jest.unstable_mockModule('@prisma/client', () => ({
    PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
    Prisma: { PrismaClientKnownRequestError: class extends Error { } },
}));
import passportPkg from 'passport';
jest.unstable_mockModule('../../src/config/passport.js', () => ({ default: passportPkg }));

// Mock HTTP runner so we don't make real network calls
const mockExecuteHttpRequest = jest.fn();
jest.unstable_mockModule('../../src/services/http-runner.service.js', () => ({
    executeHttpRequest: mockExecuteHttpRequest,
}));

// ─── Build App ────────────────────────────────────────────────
const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const httpStatus = (await import('http-status')).default;
const { default: routes } = await import('../../src/routes/index.js');
const { errorConverter, errorHandler } = await import('../../src/middlewares/error.js');
const { default: ApiError } = await import('../../src/utils/ApiError.js');
const { default: passportMw } = await import('../../src/config/passport.js');

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(passportMw.initialize());
    app.use('/v1', routes);
    app.use((req, res, next) => next(new ApiError(httpStatus.NOT_FOUND, 'Not found')));
    app.use(errorConverter);
    app.use(errorHandler);
    return app;
};

// ─── Helpers ──────────────────────────────────────────────────
const JWT_SECRET = 'fruP3yHdgYVJUW9A5U/QxrmbJu2kw2aanP9FYc/k0Tg=';
const makeToken = () => jwt.sign({ sub: 'user-1' }, JWT_SECRET, { expiresIn: '1h' });

// RBAC middleware requireWorkspaceRole('EDITOR') on /v1/requests/execute runs
// BEFORE the controller's inline check and reads member.workspace.deletedAt
const MEMBER_OK = { role: 'OWNER', workspace: { id: 'ws-001', deletedAt: null } };

// executeAdHocRequest reads: req.body.workspaceId, req.body.protocol, req.body.config (JSON)
const makeExecPayload = (url, method = 'GET') => ({
    workspaceId: 'ws-001',   // must be >= 5 chars
    config: JSON.stringify({ method, url, headers: {}, params: {}, body: { type: 'none' } }),
});

const GOOD_RESPONSE = {
    success: true,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    data: { hello: 'world' },
    size: 120,
    timings: { dnsLookup: 5, tcpConnection: 8, tlsHandshake: 0, firstByte: 25, download: 5, total: 43 },
    cookies: {},
};

describe('Suite A — API ↔ Distributed Tracing', () => {
    let app, token;

    beforeAll(() => {
        process.env.JWT_SECRET = JWT_SECRET;
        app = buildApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        token = makeToken();
        mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'u@test.com' });
        mockPrisma.workspaceMember.findUnique.mockResolvedValue(MEMBER_OK);
        mockPrisma.cookie.findMany.mockResolvedValue([]);
        mockExecutionLog.create.mockResolvedValue({ _id: 'log-1' });
    });

    // ── A1: Successful request produces an execution trace log ─────
    test('A1: Request execution creates ExecutionLog with full timing waterfall', async () => {
        mockExecuteHttpRequest.mockResolvedValue(GOOD_RESPONSE);

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('https://api.example.com/users'));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.timings).toMatchObject({
            dnsLookup: expect.any(Number),
            tcpConnection: expect.any(Number),
            total: expect.any(Number),
        });

        // ExecutionLog must be written to MongoDB with timing data
        expect(mockExecutionLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                url: 'https://api.example.com/users',
                status: 200,
                workspaceId: 'ws-001',
                timings: expect.objectContaining({ total: 43 }),
            })
        );
    });

    // ── A2: Concurrent requests produce separate trace log entries ──
    test('A2: 3 concurrent API executions each produce a separate ExecutionLog entry', async () => {
        mockExecuteHttpRequest
            .mockResolvedValueOnce({ ...GOOD_RESPONSE })
            .mockResolvedValueOnce({ ...GOOD_RESPONSE })
            .mockResolvedValueOnce({ ...GOOD_RESPONSE });

        const [r1, r2, r3] = await Promise.all([
            request(app).post('/v1/requests/execute').set('Cookie', `token=${token}`).send(makeExecPayload('https://api.example.com/a')),
            request(app).post('/v1/requests/execute').set('Cookie', `token=${token}`).send(makeExecPayload('https://api.example.com/b')),
            request(app).post('/v1/requests/execute').set('Cookie', `token=${token}`).send(makeExecPayload('https://api.example.com/c')),
        ]);

        expect(mockExecuteHttpRequest).toHaveBeenCalledTimes(3);
        expect(mockExecutionLog.create).toHaveBeenCalledTimes(3);

        // Verify each logged a different URL
        const loggedUrls = mockExecutionLog.create.mock.calls.map(([d]) => d.url);
        expect(new Set(loggedUrls).size).toBe(3);
    });

    // ── A3: Downstream 5xx errors captured in trace ────────────────
    test('A3: Downstream 503 is captured in trace — API responds 200 with failure data', async () => {
        mockExecuteHttpRequest.mockResolvedValue({
            success: false, status: 503, statusText: 'Service Unavailable',
            headers: {}, data: { error: 'downstream down' },
            size: 30, timings: { total: 100 }, cookies: {},
        });

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('https://down.example.com/api'));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.status).toBe(503);

        expect(mockExecutionLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ status: 503, url: 'https://down.example.com/api' })
        );
    });

    // ── A4: Network errors (status 0) captured in trace ───────────
    test('A4: Network timeout captured as status:0 in ExecutionLog', async () => {
        mockExecuteHttpRequest.mockResolvedValue({
            success: false, status: 0, statusText: 'Error',
            headers: {}, data: { error: 'Request Timed Out' },
            size: 0, timings: { total: 10000 }, cookies: {},
        });

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('http://nowhere.example.com'));

        expect(res.body.status).toBe(0);
        expect(mockExecutionLog.create).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }));
    });

    // ── A5: Authentication required — no trace on 401 ─────────────
    test('A5: Unauthenticated requests are blocked, no trace is created', async () => {
        const res = await request(app)
            .post('/v1/requests/execute')
            .send(makeExecPayload('https://api.example.com/test'));

        expect(res.status).toBe(401);
        expect(mockExecutionLog.create).not.toHaveBeenCalled();
        expect(mockExecuteHttpRequest).not.toHaveBeenCalled();
    });
});
