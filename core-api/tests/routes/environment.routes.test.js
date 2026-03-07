import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import httpStatus from 'http-status';

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

const mockControllers = {
    deleteEnvironment: jest.fn((req, res) => res.status(204).send()),
    updateEnvironment: jest.fn((req, res) => res.send({})),
    togglePersistent: jest.fn((req, res) => res.send({})),
    createVariable: jest.fn((req, res) => res.status(201).send({})),
    getVariables: jest.fn((req, res) => res.send([])),
    updateVariable: jest.fn((req, res) => res.send({})),
    renameVariable: jest.fn((req, res) => res.send({})),
    deleteVariable: jest.fn((req, res) => res.status(204).send()),
};

// Mock modules
jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

jest.unstable_mockModule('../../src/middlewares/rbac.middleware.js', () => ({
    requireWorkspaceRole: mockRequireWorkspaceRole,
}));

jest.unstable_mockModule('../../src/controllers/environment.controller.js', () => ({
    deleteEnvironment: mockControllers.deleteEnvironment,
    updateEnvironment: mockControllers.updateEnvironment,
    togglePersistent: mockControllers.togglePersistent,
    createVariable: mockControllers.createVariable,
    getVariables: mockControllers.getVariables,
    updateVariable: mockControllers.updateVariable,
    renameVariable: mockControllers.renameVariable,
    deleteVariable: mockControllers.deleteVariable,
}));

// Import router
const { default: environmentRouter } = await import('../../src/routes/environment.routes.js');

describe('Environment Routes', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/environments', environmentRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('DELETE /environments/:environmentId should call deleteEnvironment', async () => {
        const response = await request(app).delete('/environments/env1');
        expect(response.status).toBe(204);
        expect(mockControllers.deleteEnvironment).toHaveBeenCalled();
    });

    test('POST /environments/:environmentId/variables should call createVariable', async () => {
        const response = await request(app)
            .post('/environments/env1/variables')
            .send({ key: 'K1', value: 'V1' });
        expect(response.status).toBe(201);
        expect(mockControllers.createVariable).toHaveBeenCalled();
    });

    test('GET /environments/:environmentId/variables should call getVariables', async () => {
        const response = await request(app).get('/environments/env1/variables');
        expect(response.status).toBe(200);
        expect(mockControllers.getVariables).toHaveBeenCalled();
    });
});
