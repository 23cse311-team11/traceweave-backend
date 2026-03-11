import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// --------------------
// Service/Dependency Mocks
// --------------------
const mockHttpRunner = {
    executeHttpRequest: jest.fn().mockResolvedValue({
        success: true,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { user: { id: '1' } },
        timings: { total: 100 }
    }),
};

const mockSseService = {
    addClient: jest.fn((id, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('event: connected\ndata: ok\n\n');
        res.end();
    }),
};

const mockPrisma = {
    workspaceMember: {
        findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }),
    }
};

const mockExecutionLog = {
    create: jest.fn().mockResolvedValue({ _id: 'exec123' }),
};

const mockEnvironmentService = {
    getVariablesForExecution: jest.fn().mockResolvedValue({}),
};

const mockCookieService = {
    loadCookieJar: jest.fn().mockResolvedValue({
        getCookieString: jest.fn().mockResolvedValue('test-cookie=123')
    }),
    persistCookieJar: jest.fn().mockResolvedValue(),
};

const mockRequestDefinitionService = {
    createRequest: jest.fn(),
    getRequestsByCollection: jest.fn(),
    updateRequest: jest.fn(),
    softDeleteRequest: jest.fn(),
};

// --- MOCK MODULES ---

jest.unstable_mockModule('../../src/services/http-runner.service.js', () => ({
    executeHttpRequest: mockHttpRunner.executeHttpRequest
}));

jest.unstable_mockModule('../../src/services/sse.service.js', () => ({
    sseService: mockSseService
}));

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
    default: mockPrisma
}));

jest.unstable_mockModule('../../src/models/execution.model.js', () => ({
    default: mockExecutionLog
}));

jest.unstable_mockModule('../../src/services/environment.service.js', () => ({
    environmentService: mockEnvironmentService
}));

jest.unstable_mockModule('../../src/services/variableSubstitution.service.js', () => ({
    substituteVariables: jest.fn((config) => config)
}));

jest.unstable_mockModule('../../src/services/cookie.service.js', () => ({
    loadCookieJar: mockCookieService.loadCookieJar,
    persistCookieJar: mockCookieService.persistCookieJar,
    clearUserCookies: jest.fn().mockResolvedValue(),
}));

jest.unstable_mockModule('../../src/services/requestDefinition.service.js', () => ({
    requestDefinitionService: mockRequestDefinitionService
}));

// Keep the mock fn at module scope so tests can override it with mockImplementationOnce
const mockExecuteGraphQLRequest = jest.fn().mockResolvedValue({
    success: true,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { user: { id: '1' } },
    timings: { total: 100 }
});

jest.unstable_mockModule('../../src/services/graphql-runner.service.js', () => ({
    executeGraphQLRequest: mockExecuteGraphQLRequest
}));

// Mock RBAC
const mockRequireWorkspaceRole = (role) => jest.fn((req, res, next) => {
    req.workspaceId = req.params.workspaceId || req.body?.workspaceId || 'ws123';
    next();
});

jest.unstable_mockModule('../../src/middlewares/rbac.middleware.js', () => ({
    requireWorkspaceRole: mockRequireWorkspaceRole,
}));

// Mock Auth
const mockAuthMiddleware = jest.fn((req, res, next) => {
    req.user = { id: 'user123' };
    next();
});

jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

// Import router after mocking
const { default: requestRouter } = await import('../../src/routes/request.route.js');

describe('Advanced Runners Integration', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api/v1/requests', requestRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GraphQL Execution (POST /api/v1/requests/execute)', () => {
        test('should execute a GraphQL query via the ad-hoc endpoint', async () => {
            const gqlData = {
                workspaceId: 'ws123',
                protocol: 'graphql',
                config: {
                    url: 'http://api.test/graphql',
                    query: 'query { user { id } }',
                    variables: { id: '1' }
                }
            };

            const response = await request(app)
                .post('/api/v1/requests/execute')
                .send(gqlData);

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual({ user: { id: '1' } });
        });

        test('should return 400 if workspaceId is missing or too short', async () => {
            // The controller checks: !workspaceId || workspaceId.length < 5
            const response = await request(app)
                .post('/api/v1/requests/execute')
                .send({
                    workspaceId: 'xs', // too short (< 5 chars)
                    protocol: 'graphql',
                    config: { url: 'http://api.test/graphql', query: '{ user { id } }' }
                });
            // Controller returns 400 for short workspaceId
            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Missing workspaceId or url');
        });
    });

    describe('SSE Stream (GET /api/v1/requests/ws/stream)', () => {
        test('should establish an SSE connection', async () => {
            const response = await request(app)
                .get('/api/v1/requests/ws/stream?connectionId=test_stream');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toContain('text/event-stream');
            expect(mockSseService.addClient).toHaveBeenCalledWith('test_stream', expect.anything());
        });

        test('should return 400 if connectionId is missing', async () => {
            const response = await request(app).get('/api/v1/requests/ws/stream');
            expect(response.status).toBe(400);
        });
    });
});
