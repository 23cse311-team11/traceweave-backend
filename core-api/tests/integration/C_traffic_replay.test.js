/**
 * Integration Test Suite C: Traffic Replay + Tracing
 *
 * Purpose:
 *   Validate the traffic replay pipeline — recording a request execution,
 *   replaying it, and confirming trace logs are produced for both the
 *   original and replayed executions.
 *
 * Coverage:
 *   - Execute an API request (record), verify ExecutionLog saved
 *   - Replay same request config again → verify new ExecutionLog created
 *   - Ensure replayed trace has matching URL/method/status
 *   - Variable substitution in replayed requests (environment vars)
 *   - GET request history confirms replay fidelity
 *   - HTTPS replay captures TLS timing
 *
 * NOTE: executeAdHocRequest reads config from req.body.config (JSON string).
 *       workspaceId must be >= 5 chars. CookieJarModel is used by cookie.service.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ─── Mocks ─────────────────────────────────────────────────────
const mockPrisma = {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    collection: { findUnique: jest.fn() },
    requestDefinition: { findUnique: jest.fn() },
    cookie: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
};
const mockExecutionLog = { create: jest.fn(), find: jest.fn() };
const mockExecuteHttpRequest = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../src/config/mongo.js', () => ({ default: jest.fn().mockResolvedValue(true) }));
jest.unstable_mockModule('../../src/models/execution.model.js', () => ({ default: mockExecutionLog }));
jest.unstable_mockModule('../../src/models/workflow-log.model.js', () => ({ default: { create: jest.fn() } }));
// CookieJarModel is used by cookie.service.js's loadCookieJar inside executeAdHocRequest
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
// RBAC middleware on BOTH /execute and /history routes reads member.workspace.deletedAt
const MEMBER_OK = { role: 'OWNER', workspace: { id: 'ws-001', deletedAt: null } };
const MEMBER_RBAC = { role: 'OWNER', workspace: { id: 'ws-001', deletedAt: null } };

// executeAdHocRequest reads: req.body.workspaceId (>= 5 chars), req.body.config (JSON string)
const makeExecPayload = (url, method = 'POST', body = { type: 'raw', raw: '{"email":"user@test.com","password":"secret"}' }) => ({
    workspaceId: 'ws-001',
    config: JSON.stringify({
        method,
        url,
        headers: { 'Content-Type': 'application/json' },
        params: {},
        body,
    }),
});

const RECORDED_RESPONSE = {
    success: true, status: 200, statusText: 'OK',
    headers: { 'content-type': 'application/json', 'x-request-id': 'orig-trace-001' },
    data: { token: 'jwt-original', userId: 'u1' },
    size: 120,
    timings: { dnsLookup: 3, tcpConnection: 8, tlsHandshake: 15, firstByte: 30, download: 5, total: 61 },
    cookies: {},
};

describe('Suite C — Traffic Replay + Tracing', () => {
    let app, token;

    beforeAll(() => {
        process.env.JWT_SECRET = JWT_SECRET;
        app = buildApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        token = makeToken();
        mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
        mockPrisma.workspaceMember.mockResolvedValue?.(MEMBER_OK);
        mockPrisma.workspaceMember.findUnique.mockResolvedValue(MEMBER_OK);
        mockExecutionLog.create.mockResolvedValue({ _id: 'log-recorded' });
    });

    // ── C1: Original execution creates a reproducible trace ────────
    test('C1: Original request execution creates a replayable ExecutionLog entry', async () => {
        mockExecuteHttpRequest.mockResolvedValue(RECORDED_RESPONSE);

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('https://api.example.com/auth/login'));

        expect(res.status).toBe(200);
        expect(res.body.status).toBe(200);

        const logCall = mockExecutionLog.create.mock.calls[0][0];
        expect(logCall.method).toBe('POST');
        expect(logCall.url).toBe('https://api.example.com/auth/login');
        expect(logCall.status).toBe(200);
        expect(logCall.timings).toMatchObject({ total: expect.any(Number) });
    });

    // ── C2: Replaying the same request produces a new trace ────────
    test('C2: Replaying a recorded request config creates a new distinct trace entry', async () => {
        const replayResponse = {
            ...RECORDED_RESPONSE,
            headers: { ...RECORDED_RESPONSE.headers, 'x-request-id': 'replay-trace-002' },
            timings: { ...RECORDED_RESPONSE.timings, total: 55 },
        };

        mockExecuteHttpRequest
            .mockResolvedValueOnce(RECORDED_RESPONSE)
            .mockResolvedValueOnce(replayResponse);
        mockExecutionLog.create
            .mockResolvedValueOnce({ _id: 'log-original' })
            .mockResolvedValueOnce({ _id: 'log-replay' });

        const payload = makeExecPayload('https://api.example.com/auth/login');
        await request(app).post('/v1/requests/execute').set('Cookie', `token=${token}`).send(payload);
        const replayRes = await request(app).post('/v1/requests/execute').set('Cookie', `token=${token}`).send(payload);

        expect(replayRes.status).toBe(200);
        expect(mockExecuteHttpRequest).toHaveBeenCalledTimes(2);
        expect(mockExecutionLog.create).toHaveBeenCalledTimes(2);

        const [orig, replay] = mockExecutionLog.create.mock.calls.map(([d]) => d);
        expect(orig.url).toBe(replay.url);
        expect(orig.method).toBe(replay.method);
        expect(orig.status).toBe(replay.status);
    });

    // ── C3: Replay with variable substitution ─────────────────────
    test('C3: Replaying with environment variables substitutes values correctly', async () => {
        const { substituteVariables } = await import('../../src/services/variableSubstitution.service.js');

        const recordedConfig = {
            method: 'GET',
            url: 'https://{{BASE_URL}}/api/users/{{USER_ID}}',
            headers: { Authorization: 'Bearer {{AUTH_TOKEN}}' },
            params: {},
            body: null,
        };
        const envVars = { BASE_URL: 'api.prod.example.com', USER_ID: 'user-42', AUTH_TOKEN: 'prod-jwt-token' };
        const substituted = substituteVariables(recordedConfig, envVars);

        expect(substituted.url).toBe('https://api.prod.example.com/api/users/user-42');
        expect(substituted.headers.Authorization).toBe('Bearer prod-jwt-token');
        expect(mockExecuteHttpRequest).not.toHaveBeenCalled();
    });

    // ── C4: GET request history returns trace logs ────────────────
    test('C4: GET request history returns original and replayed traces', async () => {
        // GET /requests/:requestId/history goes through RBAC — needs workspace nesting
        mockPrisma.workspaceMember.findUnique.mockResolvedValue(MEMBER_RBAC);
        // RBAC resolves workspaceId from requestDefinition → collection
        mockPrisma.requestDefinition.findUnique.mockResolvedValue({
            id: 'req-1',
            collectionId: 'col-1',
            collection: { workspaceId: 'ws-001' },
        });

        const historyLogs = [
            { _id: 'log-orig', method: 'POST', url: 'https://api.example.com/auth/login', status: 200, createdAt: new Date('2025-01-01') },
            { _id: 'log-replay', method: 'POST', url: 'https://api.example.com/auth/login', status: 200, createdAt: new Date('2025-01-02') },
        ];

        // Controller: ExecutionLog.find({...}).sort({createdAt:-1}).limit(20)
        const mockFindChain = {
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue(historyLogs),
        };
        mockExecutionLog.find.mockReturnValue(mockFindChain);

        // Controller: const { environmentId } = req.body — must send JSON body or req.body is undefined
        const res = await request(app)
            .get('/v1/requests/req-1/history')
            .set('Cookie', `token=${token}`)
            .set('Content-Type', 'application/json')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].url).toBe('https://api.example.com/auth/login');
    });

    // ── C5: HTTPS request replay captures TLS timing ─────────────
    test('C5: HTTPS request replay captures TLS handshake timing in trace', async () => {
        const httpsResponse = {
            ...RECORDED_RESPONSE,
            timings: { dnsLookup: 4, tcpConnection: 12, tlsHandshake: 25, firstByte: 35, download: 8, total: 84 },
        };
        mockExecuteHttpRequest.mockResolvedValue(httpsResponse);
        mockExecutionLog.create.mockResolvedValue({ _id: 'log-https' });

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('https://api.example.com/auth/login'));

        expect(res.status).toBe(200);
        expect(res.body.timings.tlsHandshake).toBe(25);
        expect(res.body.timings.total).toBe(84);
        expect(mockExecutionLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ timings: expect.objectContaining({ tlsHandshake: 25 }) })
        );
    });
});
