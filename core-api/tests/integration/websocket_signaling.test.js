import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import EventEmitter from 'events';

// --------------------
// Service Mocks
// --------------------
const mockSseService = {
    addClient: jest.fn(),
    sendEvent: jest.fn(),
};

const mockEnvironmentService = {
    getVariablesForExecution: jest.fn().mockResolvedValue({}),
};

const mockCookieService = {
    loadCookieJar: jest.fn().mockResolvedValue({
        getCookieString: jest.fn().mockResolvedValue('test-cookie=123')
    }),
    persistCookieJar: jest.fn().mockResolvedValue(),
    clearUserCookies: jest.fn().mockResolvedValue(),
};

// Mock WS Client
class MockWS extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    constructor(url, options) {
        super();
        this.url = url;
        this.options = options;
        this.readyState = MockWS.OPEN;
        // Simulate open event on next tick
        process.nextTick(() => this.emit('open'));
    }
    send = jest.fn();
    close = jest.fn();
}

jest.unstable_mockModule('ws', () => ({
    default: MockWS
}));

jest.unstable_mockModule('../../src/services/sse.service.js', () => ({
    sseService: mockSseService
}));

jest.unstable_mockModule('../../src/services/environment.service.js', () => ({
    environmentService: mockEnvironmentService
}));

jest.unstable_mockModule('../../src/services/cookie.service.js', () => ({
    loadCookieJar: mockCookieService.loadCookieJar,
    persistCookieJar: mockCookieService.persistCookieJar,
    clearUserCookies: mockCookieService.clearUserCookies,
}));

jest.unstable_mockModule('../../src/services/variableSubstitution.service.js', () => ({
    substituteVariables: jest.fn((config) => config)
}));

// Mock Auth
const mockAuthMiddleware = jest.fn((req, res, next) => {
    req.user = { id: 'user123' };
    next();
});

jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

// Important: Import the router AFTER mocking everything
const { default: requestRouter } = await import('../../src/routes/request.route.js');

describe('WebSocket Signaling Integration', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api/v1/requests', requestRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/v1/requests/ws/connect', () => {
        test('should initiate a connection and return 200', async () => {
            const connectData = {
                connectionId: 'conn123',
                url: 'echo.websocket.org',
                workspaceId: 'ws1'
            };

            const response = await request(app)
                .post('/api/v1/requests/ws/connect')
                .send(connectData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe("Connecting...");

            // Should have injected cookies since workspaceId was provided
            expect(mockCookieService.loadCookieJar).toHaveBeenCalled();
        });

        test('should return 400 if connectionId or url is missing', async () => {
            const response = await request(app)
                .post('/api/v1/requests/ws/connect')
                .send({ connectionId: 'conn123' });
            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/v1/requests/ws/send', () => {
        test('should send a message through an active connection', async () => {
            // First connect we need to register the mock ws in the service's map
            // Since the service logic is internal and we are mocking the WS class,
            // we rely on the fact that the service will use our MockWS.

            // For sending, we first need a connection to exist.
            // In integration tests with real services, we'd need to actually call connect first.
            await request(app).post('/api/v1/requests/ws/connect').send({
                connectionId: 'conn_send',
                url: 'echo.test'
            });

            // Small delay to allow the 'open' event to fire and the service to set the socket
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = await request(app)
                .post('/api/v1/requests/ws/send')
                .send({ connectionId: 'conn_send', message: 'Hello World' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(mockSseService.sendEvent).toHaveBeenCalledWith(
                'conn_send',
                'ws_message',
                expect.objectContaining({ direction: 'outgoing', message: 'Hello World' })
            );
        });
    });

    describe('POST /api/v1/requests/ws/disconnect', () => {
        test('should disconnect an active connection', async () => {
            await request(app).post('/api/v1/requests/ws/connect').send({
                connectionId: 'conn_disco',
                url: 'echo.test'
            });
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = await request(app)
                .post('/api/v1/requests/ws/disconnect')
                .send({ connectionId: 'conn_disco' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });
});
