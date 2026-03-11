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

const mockGetExecutionById = jest.fn((req, res) =>
    res.status(200).json({
        id: 'exec1',
        status: 'SUCCESS',
        workflowId: 'wf1',
    })
);

// Mock modules
jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

jest.unstable_mockModule('../../src/controllers/execution.controller.js', () => ({
    getExecutionById: mockGetExecutionById,
}));

// Import router after mocks
const { default: executionRouter } = await import('../../src/routes/execution.route.js');

describe('Execution Routes', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/executions', executionRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('GET /executions/:execId should call getExecutionById and return 200', async () => {
        const response = await request(app).get('/executions/exec1');

        expect(response.status).toBe(200);
        expect(mockGetExecutionById).toHaveBeenCalled();
        expect(response.body).toHaveProperty('id', 'exec1');
        expect(response.body).toHaveProperty('status', 'SUCCESS');
    });

    test('GET /executions/:execId should pass the executionId as a route param', async () => {
        await request(app).get('/executions/exec-abc');

        expect(mockGetExecutionById).toHaveBeenCalledTimes(1);
        const [req] = mockGetExecutionById.mock.calls[0];
        expect(req.params.execId).toBe('exec-abc');
    });

    test('GET /executions/:execId should require authentication', async () => {
        // Verify auth middleware is called
        await request(app).get('/executions/exec1');
        expect(mockAuthMiddleware).toHaveBeenCalled();
    });
});
