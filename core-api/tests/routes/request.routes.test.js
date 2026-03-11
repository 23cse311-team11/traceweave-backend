import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// --------------------
// Mocks
// --------------------
const mockAuthMiddleware = jest.fn((req, res, next) => {
    req.user = { id: 'user1' };
    next();
});

const mockRequireWorkspaceRole = (role) => jest.fn((req, res, next) => {
    req.workspaceId = 'ws1';
    next();
});

const mockRequestController = {
    executeAdHocRequest: jest.fn((req, res) => res.status(200).json({ status: 'ok', response: { statusCode: 200 } })),
    createRequest: jest.fn((req, res) => res.status(201).json({ id: 'req1', name: 'Test Request' })),
    getRequestsByCollection: jest.fn((req, res) => res.status(200).json({ requests: [] })),
    sendRequest: jest.fn((req, res) => res.status(200).json({ statusCode: 200, body: '{}' })),
    getRequestHistory: jest.fn((req, res) => res.status(200).json({ history: [] })),
    updateRequest: jest.fn((req, res) => res.status(200).json({ id: 'req1' })),
    deleteRequest: jest.fn((req, res) => res.status(200).json({ message: 'Deleted' })),
    syncExecutionHistory: jest.fn((req, res) => res.status(200).json({ synced: true })),
};

const mockCookieController = {
    getCookies: jest.fn((req, res) => res.status(200).json({ cookies: [] })),
    createCookie: jest.fn((req, res) => res.status(201).json({ id: 'c1' })),
    updateCookie: jest.fn((req, res) => res.status(200).json({ id: 'c1' })),
    deleteCookie: jest.fn((req, res) => res.status(204).send()),
    clearCookies: jest.fn((req, res) => res.status(200).json({ cleared: true })),
};

const mockWsController = {
    streamConnection: jest.fn((req, res) => res.status(200).send()),
    connectTarget: jest.fn((req, res) => res.status(200).json({ connected: true })),
    sendMessage: jest.fn((req, res) => res.status(200).json({ sent: true })),
    disconnectTarget: jest.fn((req, res) => res.status(200).json({ disconnected: true })),
};

// Mock modules
jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

jest.unstable_mockModule('../../src/middlewares/rbac.middleware.js', () => ({
    requireWorkspaceRole: mockRequireWorkspaceRole,
}));

jest.unstable_mockModule('../../src/controllers/request.controller.js', () => ({
    requestController: mockRequestController,
}));

jest.unstable_mockModule('../../src/controllers/cookie.controller.js', () => ({
    cookieController: mockCookieController,
}));

jest.unstable_mockModule('../../src/controllers/ws.controller.js', () => ({
    wsController: mockWsController,
}));

const mockMulterInstance = () => ({ any: () => (req, res, next) => next() });
mockMulterInstance.memoryStorage = () => ({});
mockMulterInstance.diskStorage = () => ({});

jest.unstable_mockModule('multer', () => ({
    default: mockMulterInstance,
}));

// Import router after all mocks
const { default: requestRouter } = await import('../../src/routes/request.route.js');

describe('Request Routes', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/requests', requestRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- Ad-hoc Execution ---
    test('POST /requests/execute should call executeAdHocRequest', async () => {
        const response = await request(app)
            .post('/requests/execute')
            .send({ url: 'https://api.example.com', method: 'GET' });

        expect(response.status).toBe(200);
        expect(mockRequestController.executeAdHocRequest).toHaveBeenCalled();
    });

    // --- Request CRUD ---
    test('POST /requests/:collectionId should call createRequest', async () => {
        const response = await request(app)
            .post('/requests/coll1')
            .send({ name: 'My Request', method: 'GET', url: 'http://example.com' });

        expect(response.status).toBe(201);
        expect(mockRequestController.createRequest).toHaveBeenCalled();
    });

    test('GET /requests/collection/:collectionId should call getRequestsByCollection', async () => {
        const response = await request(app).get('/requests/collection/coll1');

        expect(response.status).toBe(200);
        expect(mockRequestController.getRequestsByCollection).toHaveBeenCalled();
    });

    test('POST /requests/:requestId/send should call sendRequest', async () => {
        const response = await request(app)
            .post('/requests/req1/send')
            .send({});

        expect(response.status).toBe(200);
        expect(mockRequestController.sendRequest).toHaveBeenCalled();
    });

    test('GET /requests/:requestId/history should call getRequestHistory', async () => {
        const response = await request(app).get('/requests/req1/history');

        expect(response.status).toBe(200);
        expect(mockRequestController.getRequestHistory).toHaveBeenCalled();
    });

    test('PATCH /requests/:requestId should call updateRequest', async () => {
        const response = await request(app)
            .patch('/requests/req1')
            .send({ name: 'Updated Request' });

        expect(response.status).toBe(200);
        expect(mockRequestController.updateRequest).toHaveBeenCalled();
    });

    test('DELETE /requests/:requestId should call deleteRequest', async () => {
        const response = await request(app).delete('/requests/req1');

        expect(response.status).toBe(200);
        expect(mockRequestController.deleteRequest).toHaveBeenCalled();
    });

    // --- Cookie Jar ---
    test('GET /requests/jar/cookies should call getCookies', async () => {
        const response = await request(app).get('/requests/jar/cookies');
        expect(response.status).toBe(200);
        expect(mockCookieController.getCookies).toHaveBeenCalled();
    });

    test('POST /requests/jar/cookies should call createCookie', async () => {
        const response = await request(app)
            .post('/requests/jar/cookies')
            .send({ name: 'session', value: 'abc123', domain: 'example.com' });
        expect(response.status).toBe(201);
        expect(mockCookieController.createCookie).toHaveBeenCalled();
    });

    test('DELETE /requests/jar/cookies should call clearCookies', async () => {
        const response = await request(app).delete('/requests/jar/cookies');
        expect(response.status).toBe(200);
        expect(mockCookieController.clearCookies).toHaveBeenCalled();
    });
});
