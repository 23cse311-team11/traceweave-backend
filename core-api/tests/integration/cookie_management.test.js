import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import httpStatus from 'http-status';

// --------------------
// DB Mocks
// --------------------
const mockCookieJarModel = {
    find: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
};

// Use proxy to mimic mongoose model behavior if needed
mockCookieJarModel.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
    then: jest.fn((cb) => Promise.resolve([]).then(cb)),
});

// Mock Mongoose Model
jest.unstable_mockModule('../../src/models/cookie-jar.model.js', () => ({
    default: mockCookieJarModel
}));

// Mock Auth Middleware
const mockAuthMiddleware = jest.fn((req, res, next) => {
    req.user = { id: 'user123' };
    next();
});

jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

// Mock RBAC (if used by cookie routes, though cookie routes usually only need auth)
const mockRequireWorkspaceRole = (role) => jest.fn((req, res, next) => {
    req.workspaceId = req.params.workspaceId || 'ws123';
    next();
});

jest.unstable_mockModule('../../src/middlewares/rbac.middleware.js', () => ({
    requireWorkspaceRole: mockRequireWorkspaceRole,
}));

// Important: Import the router AFTER mocking everything
const { default: requestRouter } = await import('../../src/routes/request.route.js');

describe('Cookie Management Integration', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        // Cookie routes are mounted under /requests in index.js, but let's mount the router directly
        app.use('/api/v1/requests', requestRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/v1/requests/jar/cookies', () => {
        test('should return cookies for a workspace', async () => {
            const mockCookies = [{ _id: 'c1', domain: 'example.com', key: 'session', value: '123' }];
            // Handle different ways find() might be called (with or without sort)
            mockCookieJarModel.find.mockReturnValue({
                sort: jest.fn().mockResolvedValue(mockCookies)
            });

            const response = await request(app)
                .get('/api/v1/requests/jar/cookies?workspaceId=ws123')
                .set('Accept', 'application/json');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockCookies);
            expect(mockCookieJarModel.find).toHaveBeenCalledWith(expect.objectContaining({
                userId: 'user123',
                workspaceId: 'ws123'
            }));
        });

        test('should return 400 if workspaceId is missing', async () => {
            const response = await request(app).get('/api/v1/requests/jar/cookies');
            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/v1/requests/jar/cookies', () => {
        test('should create a new cookie', async () => {
            const cookieData = {
                workspaceId: 'ws123',
                domain: 'example.com',
                key: 'session',
                value: '456'
            };
            mockCookieJarModel.create.mockResolvedValue({ _id: 'c2', ...cookieData });

            const response = await request(app)
                .post('/api/v1/requests/jar/cookies')
                .send(cookieData);

            expect(response.status).toBe(201);
            expect(response.body.key).toBe('session');
            expect(mockCookieJarModel.create).toHaveBeenCalled();
        });
    });

    describe('PUT /api/v1/requests/jar/cookies/:cookieId', () => {
        test('should update an existing cookie', async () => {
            const updateData = { domain: 'example.com', key: 'session', value: 'new-val' };
            mockCookieJarModel.findOneAndUpdate.mockResolvedValue({ _id: 'c1', ...updateData });

            const response = await request(app)
                .put('/api/v1/requests/jar/cookies/c1')
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.value).toBe('new-val');
            expect(mockCookieJarModel.findOneAndUpdate).toHaveBeenCalled();
        });
    });

    describe('DELETE /api/v1/requests/jar/cookies/:cookieId', () => {
        test('should delete a cookie', async () => {
            mockCookieJarModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

            const response = await request(app).delete('/api/v1/requests/jar/cookies/c1');

            expect(response.status).toBe(204);
            expect(mockCookieJarModel.deleteOne).toHaveBeenCalledWith({
                _id: 'c1',
                userId: 'user123'
            });
        });
    });
});
