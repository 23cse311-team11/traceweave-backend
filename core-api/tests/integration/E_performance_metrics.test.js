/**
 * Integration Test Suite E: Performance + Metrics Analysis
 *
 * Purpose:
 *   Validate that the system correctly captures, stores, and exposes
 *   performance metrics — timing breakdowns (DNS, TCP, TLS, TTFB, download),
 *   response sizes, and workspace execution history for analytics.
 *
 * Coverage:
 *   - Full timing waterfall (6 fields) present in trace
 *   - Response size captured for bandwidth analytics
 *   - HTTPS TLS handshake timing captured
 *   - High-volume execution (10 concurrent): all N traces created
 *   - Slow request (TTFB > 1000ms) captured correctly
 *   - GET /workspaces/:id/history → paginated logs for analytics
 *
 * NOTE: executeAdHocRequest reads config from req.body.config (JSON string/object).
 *       workspaceId must be >= 5 chars. Member check inline in the controller.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ─── Mocks ─────────────────────────────────────────────────────
const mockPrisma = {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    cookie: { findMany: jest.fn() },
};
const mockExecutionLog = {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
};
const mockExecuteHttpRequest = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({ default: mockPrisma }));
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
jest.unstable_mockModule('../../src/services/http-runner.service.js', () => ({
    executeHttpRequest: mockExecuteHttpRequest,
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

const JWT_SECRET = 'fruP3yHdgYVJUW9A5U/QxrmbJu2kw2aanP9FYc/k0Tg=';
const makeToken = () => jwt.sign({ sub: 'user-1' }, JWT_SECRET, { expiresIn: '1h' });
// Controller's inline check only needs { role }
// RBAC middleware on ALL protected routes reads member.workspace.deletedAt
const MEMBER_OK = { role: 'OWNER', workspace: { id: 'ws-001', deletedAt: null } };
// Same shape for E6 workspace history route
const MEMBER_RBAC = { role: 'OWNER', workspace: { id: 'ws-001', deletedAt: null } };

const makeExecPayload = (url) => ({
    workspaceId: 'ws-001',
    config: JSON.stringify({ method: 'GET', url, headers: {}, params: {}, body: { type: 'none' } }),
});

const makePerfResponse = ({ totalMs = 120, tlsMs = 0, sizeBytes = 1024, firstByteMs = 100 } = {}) => ({
    success: true,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    data: { ok: true },
    size: sizeBytes,
    timings: {
        dnsLookup: 5,
        tcpConnection: 10,
        tlsHandshake: tlsMs,
        firstByte: firstByteMs,
        download: 10,
        total: totalMs,
    },
    cookies: {},
});

describe('Suite E — Performance + Metrics Analysis', () => {
    let app, token;

    beforeAll(() => {
        process.env.JWT_SECRET = JWT_SECRET;
        app = buildApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        token = makeToken();
        mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
        mockPrisma.workspaceMember.findUnique.mockResolvedValue(MEMBER_OK);
        mockPrisma.cookie.findMany.mockResolvedValue([]);
        mockExecutionLog.create.mockResolvedValue({ _id: 'log-e' });
    });

    // ── E1: Full timing waterfall captured ────────────────────────
    test('E1: Response includes all 6 timing waterfall fields', async () => {
        mockExecuteHttpRequest.mockResolvedValue(makePerfResponse({ totalMs: 250, tlsMs: 45 }));

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('https://api.example.com/perf-test'));

        expect(res.status).toBe(200);
        const t = res.body.timings;
        expect(t).toHaveProperty('dnsLookup');
        expect(t).toHaveProperty('tcpConnection');
        expect(t).toHaveProperty('tlsHandshake');
        expect(t).toHaveProperty('firstByte');
        expect(t).toHaveProperty('download');
        expect(t).toHaveProperty('total');
        expect(t.total).toBeGreaterThan(0);
    });

    // ── E2: Response size captured for bandwidth analytics ─────────
    test('E2: ExecutionLog stores responseSize in bytes for bandwidth metrics', async () => {
        const sizeBytes = 4096;
        mockExecuteHttpRequest.mockResolvedValue(makePerfResponse({ sizeBytes }));

        await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('https://api.example.com/large-response'));

        expect(mockExecutionLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ responseSize: sizeBytes })
        );
    });

    // ── E3: HTTPS requests capture non-zero TLS timing ─────────────
    test('E3: HTTPS request shows non-zero TLS handshake timing', async () => {
        mockExecuteHttpRequest.mockResolvedValue(makePerfResponse({ tlsMs: 38, totalMs: 105 }));

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('https://secure.api.example.com/data'));

        expect(res.body.timings.tlsHandshake).toBe(38);
        expect(mockExecutionLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ timings: expect.objectContaining({ tlsHandshake: 38 }) })
        );
    });

    // ── E4: High volume — 10 concurrent requests all traced ────────
    test('E4: 10 concurrent requests each produce individual ExecutionLog entries', async () => {
        mockExecuteHttpRequest.mockResolvedValue(makePerfResponse({ totalMs: 60 }));

        const N = 10;
        const responses = await Promise.all(
            Array.from({ length: N }, (_, i) =>
                request(app)
                    .post('/v1/requests/execute')
                    .set('Cookie', `token=${token}`)
                    .send(makeExecPayload(`https://api.example.com/endpoint/${i}`))
            )
        );

        expect(responses.every((r) => r.status === 200)).toBe(true);
        expect(mockExecuteHttpRequest).toHaveBeenCalledTimes(N);
        expect(mockExecutionLog.create).toHaveBeenCalledTimes(N);
    });

    // ── E5: Slow response (TTFB > 1s) captured correctly ──────────
    test('E5: Slow response (TTFB 3450ms) is captured in timing trace without error', async () => {
        mockExecuteHttpRequest.mockResolvedValue(
            makePerfResponse({ totalMs: 3500, firstByteMs: 3450, tlsMs: 0 })
        );

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('http://slow-endpoint.example.com/compute'));

        expect(res.status).toBe(200);
        expect(res.body.timings.firstByte).toBe(3450);
        expect(res.body.timings.total).toBe(3500);
    });

    // ── E6: Workspace history returns paginated metrics ─────────────
    test('E6: GET /workspaces/:id/history returns paginated execution logs', async () => {
        const logs = Array.from({ length: 5 }, (_, i) => ({
            _id: `log-${i}`,
            method: i % 2 === 0 ? 'GET' : 'POST',
            url: `https://api.example.com/ep/${i}`,
            status: i < 4 ? 200 : 503,
            timings: { total: 50 + i * 10 },
            responseSize: 1024 * (i + 1),
            createdAt: new Date(Date.now() - i * 60000),
        }));

        // Workspace history route goes through RBAC middleware — needs workspace.deletedAt:null
        mockPrisma.workspaceMember.findUnique.mockResolvedValue(MEMBER_RBAC);

        const mockFindChain = {
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(logs),
        };
        mockExecutionLog.find.mockReturnValue(mockFindChain);
        mockExecutionLog.countDocuments.mockResolvedValue(20);

        const res = await request(app)
            .get('/v1/workspaces/ws-001/history')
            .set('Cookie', `token=${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(5);
        expect(res.body.pagination).toMatchObject({ total: 20, page: 1 });
        expect(res.body.data[0]).toHaveProperty('timings');
        expect(res.body.data[0]).toHaveProperty('status');
    });
});

// integration testing step
