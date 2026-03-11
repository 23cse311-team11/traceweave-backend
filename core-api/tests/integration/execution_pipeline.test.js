import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// --------------------
// DB Mocks
// --------------------
const mockExecutionLog = {
    findById: jest.fn(),
};

// Mock Mongoose Model
jest.unstable_mockModule('../../src/models/execution.model.js', () => ({
    default: mockExecutionLog
}));

// Mock Auth Middleware
const mockAuthMiddleware = jest.fn((req, res, next) => {
    req.user = { id: 'user123' };
    next();
});

jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

// Important: Import the router AFTER mocking everything
const { default: executionRouter } = await import('../../src/routes/execution.route.js');

describe('Execution Pipeline Integration', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api/v1/executions', executionRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/v1/executions/:execId', () => {
        test('should return execution log if user owns it', async () => {
            const mockLog = {
                _id: 'exec123',
                executedBy: 'user123',
                status: 'SUCCESS',
                response: { data: 'ok' }
            };

            mockExecutionLog.findById.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockLog)
            });

            const response = await request(app).get('/api/v1/executions/exec123');

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual(mockLog);
        });

        test('should return 403 if user does not own the execution log', async () => {
            const mockLog = {
                _id: 'exec123',
                executedBy: 'different_user',
                status: 'SUCCESS'
            };

            mockExecutionLog.findById.mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockLog)
            });

            const response = await request(app).get('/api/v1/executions/exec123');

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('Access denied to this execution log');
        });

        test('should return 404 if execution log not found', async () => {
            mockExecutionLog.findById.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });

            const response = await request(app).get('/api/v1/executions/nonexistent');

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Execution log not found');
        });
    });
});

// integration testing step
