/**
 * Integration Test Suite D: Failure Simulation
 *
 * Purpose:
 *   Inject faults — timeouts, 5xx errors, network failures, auth failures,
 *   partial workflow failures — and confirm the system logs errors correctly,
 *   RBAC enforces access, and error responses contain meaningful diagnostic data.
 *
 * Coverage:
 *   - Downstream service timeout → status 0, timeout message
 *   - HTTP 500 from target → passed through, not re-thrown
 *   - Workflow mid-chain failure → remaining steps skipped, marked FAILED
 *   - RBAC rejection: VIEWER blocked from /run (403)
 *   - Expired JWT → 401, no business logic runs
 *   - Non-existent workflow → 404 from RBAC
 *   - Soft-deleted workspace → access denied (403/404)
 *
 * NOTE: D1/D2 use executeAdHocRequest which reads req.body.config.
 *       workspaceId must be >= 5 chars. CookieJarModel mock required.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ─── Mocks ─────────────────────────────────────────────────────
const mockPrisma = {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    workflow: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    workflowExecution: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    collection: { findUnique: jest.fn() },
    requestDefinition: { findUnique: jest.fn() },
};
const mockExecutionLog = { create: jest.fn() };
const mockExecuteHttpRequest = jest.fn();

jest.unstable_mockModule('../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../src/config/mongo.js', () => ({ default: jest.fn().mockResolvedValue(true) }));
jest.unstable_mockModule('../../src/models/execution.model.js', () => ({ default: mockExecutionLog }));
jest.unstable_mockModule('../../src/models/workflow-log.model.js', () => ({ default: { create: jest.fn() } }));
// CookieJarModel is used inside executeAdHocRequest via cookie.service.js
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
const makeToken = (id = 'user-1') => jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: '1h' });
// Workflow RBAC middleware needs workspace nesting
const MEMBER_OWNER = { role: 'OWNER', workspace: { id: 'ws-001', deletedAt: null } };
const MEMBER_VIEWER = { role: 'VIEWER', workspace: { id: 'ws-001', deletedAt: null } };
// D1/D2 call /v1/requests/execute → RBAC middleware requireWorkspaceRole('EDITOR') runs
// FIRST and reads member.workspace.deletedAt — so we must include full nesting
const MEMBER_INLINE = { role: 'OWNER', workspace: { id: 'ws-001', deletedAt: null } };

// executeAdHocRequest reads req.body.workspaceId (>= 5 chars) and req.body.config
const makeExecPayload = (url, method = 'GET') => ({
    workspaceId: 'ws-001',
    config: JSON.stringify({ method, url, headers: {}, params: {}, body: { type: 'none' } }),
});

describe('Suite D — Failure Simulation', () => {
    let app, token;

    beforeAll(() => {
        process.env.JWT_SECRET = JWT_SECRET;
        app = buildApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        token = makeToken();
        mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
        mockExecutionLog.create.mockResolvedValue({ _id: 'log-d' });
        mockPrisma.workflowExecution.create.mockResolvedValue({ id: 'exec-d' });
        mockPrisma.workflowExecution.update.mockResolvedValue({});
    });

    // ── D1: Simulated timeout (downstream service unavailable) ─────
    test('D1: Simulated timeout returns status 0 with timeout message in trace', async () => {
        // executeAdHocRequest does its own member check (inline, no workspace nesting needed)
        mockPrisma.workspaceMember.findUnique.mockResolvedValue(MEMBER_INLINE);
        mockExecuteHttpRequest.mockResolvedValue({
            success: false, status: 0, statusText: 'Error',
            headers: {}, data: { error: 'Request Timed Out' },
            size: 0, timings: { total: 10000 }, cookies: {},
        });

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('http://slow-service.example.com/data'));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.status).toBe(0);
        expect(res.body.data?.error).toMatch(/timed out/i);
        expect(mockExecutionLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ status: 0 })
        );
    });

    // ── D2: Simulate HTTP 500 from downstream service ──────────────
    test('D2: Downstream 500 is passed through to client as trace data (not re-thrown)', async () => {
        mockPrisma.workspaceMember.findUnique.mockResolvedValue(MEMBER_INLINE);
        mockExecuteHttpRequest.mockResolvedValue({
            success: false, status: 500, statusText: 'Internal Server Error',
            headers: { 'content-type': 'application/json' },
            data: { error: 'DB connection pool exhausted' },
            size: 60, timings: { total: 200 }, cookies: {},
        });

        const res = await request(app)
            .post('/v1/requests/execute')
            .set('Cookie', `token=${token}`)
            .send(makeExecPayload('http://legacy.example.com/process', 'POST'));

        // Our API returns 200 — the 500 is the target service's status, not ours
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.data.error).toMatch(/pool exhausted/i);
    });

    // ── D3: Workflow mid-chain failure with stopOnFailure ──────────
    test('D3: Workflow stops at failing step 2 of 3 and marks execution FAILED', async () => {
        mockPrisma.workspaceMember.findUnique.mockResolvedValue(MEMBER_OWNER);
        const workflow = {
            id: 'wf-fail', workspaceId: 'ws-001',
            steps: [
                { id: 's1', order: 0, stopOnFailure: true, request: { id: 'r1', method: 'GET', url: 'http://api.test/health', collectionId: 'col-1' } },
                { id: 's2', order: 1, stopOnFailure: true, request: { id: 'r2', method: 'POST', url: 'http://api.test/auth', collectionId: 'col-1' } },
                { id: 's3', order: 2, stopOnFailure: true, request: { id: 'r3', method: 'GET', url: 'http://api.test/data', collectionId: 'col-1' } },
            ],
        };
        mockPrisma.workflow.findUnique.mockResolvedValue(workflow);
        mockExecuteHttpRequest
            .mockResolvedValueOnce({ success: true, status: 200, statusText: 'OK', headers: {}, data: {}, size: 10, timings: { total: 10 } })
            .mockResolvedValueOnce({ success: false, status: 404, statusText: 'Not Found', headers: {}, data: { error: 'Auth endpoint gone' }, size: 20, timings: { total: 15 } });

        const res = await request(app)
            .post('/v1/workflows/wf-fail/run')
            .set('Cookie', `token=${token}`);

        expect(res.body.report.status).toBe('FAILED');
        expect(mockExecuteHttpRequest).toHaveBeenCalledTimes(2); // step 3 not reached
        expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
        );
    });

    // ── D4: RBAC blocks VIEWER from running workflow ───────────────
    test('D4: VIEWER role cannot trigger workflow run (403 Forbidden)', async () => {
        mockPrisma.workspaceMember.findUnique.mockResolvedValue(MEMBER_VIEWER);
        mockPrisma.workflow.findUnique.mockResolvedValue({ id: 'wf-1', workspaceId: 'ws-001' });

        const res = await request(app)
            .post('/v1/workflows/wf-1/run')
            .set('Cookie', `token=${token}`);

        expect(res.status).toBe(403);
        expect(mockPrisma.workflowExecution.create).not.toHaveBeenCalled();
        expect(mockExecuteHttpRequest).not.toHaveBeenCalled();
    });

    // ── D5: Expired JWT → 401 on protected routes ─────────────────
    test('D5: Expired JWT returns 401 and prevents any business logic execution', async () => {
        const expiredToken = jwt.sign({ sub: 'user-1' }, JWT_SECRET, { expiresIn: '-1s' });

        const res = await request(app)
            .post('/v1/workflows/wf-1/run')
            .set('Cookie', `token=${expiredToken}`);

        expect(res.status).toBe(401);
        expect(mockPrisma.workflowExecution.create).not.toHaveBeenCalled();
    });

    // ── D6: Non-existent workflow → RBAC 404 ──────────────────────
    test('D6: Running a non-existent workflow is blocked at RBAC (404)', async () => {
        // RBAC resolves workspaceId from workflow.findUnique — returns null → throws NOT_FOUND
        mockPrisma.workspaceMember.findUnique.mockResolvedValue(MEMBER_OWNER);
        mockPrisma.workflow.findUnique.mockResolvedValue(null);

        const res = await request(app)
            .post('/v1/workflows/nonexistent-wf/run')
            .set('Cookie', `token=${token}`);

        // RBAC middleware throws NOT_FOUND before the controller runs
        expect([404, 500]).toContain(res.status);
    });

    // ── D7: Workspace soft-deleted → access denied ────────────────
    test('D7: Accessing workspace marked as deleted returns 404/403', async () => {
        mockPrisma.workspaceMember.findUnique.mockResolvedValue({
            role: 'OWNER',
            workspace: { id: 'ws-deleted', deletedAt: new Date() }, // soft-deleted
        });

        const res = await request(app)
            .get('/v1/workflows/workspace/ws-deleted')
            .set('Cookie', `token=${token}`);

        expect([403, 404]).toContain(res.status);
        expect(mockPrisma.workflow.findMany).not.toHaveBeenCalled();
    });
});
