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
    req.workspaceId = req.params.workspaceId || 'ws1';
    next();
});

const mockControllers = {
    createCollection: jest.fn((req, res) => res.status(201).send({})),
    getCollectionsByWorkspace: jest.fn((req, res) => res.status(200).send([])),
    deleteCollection: jest.fn((req, res) => res.status(200).send({})),
    updateCollection: jest.fn((req, res) => res.status(200).send({})),
    duplicateCollection: jest.fn((req, res) => res.status(201).send({})), // ADDED MOCK IMPLEMENTATION
};

// Mock modules
jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

jest.unstable_mockModule('../../src/middlewares/rbac.middleware.js', () => ({
    requireWorkspaceRole: mockRequireWorkspaceRole,
}));

// UPDATED: Added duplicateCollection to the export object
jest.unstable_mockModule('../../src/controllers/collection.controller.js', () => ({
    createCollection: mockControllers.createCollection,
    getCollectionsByWorkspace: mockControllers.getCollectionsByWorkspace,
    deleteCollection: mockControllers.deleteCollection,
    updateCollection: mockControllers.updateCollection,
    duplicateCollection: mockControllers.duplicateCollection,
}));

// Import router
const { default: collectionRouter } = await import('../../src/routes/collection.route.js');

describe('Collection Routes', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/collections', collectionRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('POST /collections/workspace/:workspaceId should call createCollection', async () => {
        const response = await request(app)
            .post('/collections/workspace/ws1')
            .send({ name: 'New Coll' });

        expect(response.status).toBe(201);
        expect(mockControllers.createCollection).toHaveBeenCalled();
    });

    test('GET /collections/workspace/:workspaceId should call getCollectionsByWorkspace', async () => {
        const response = await request(app).get('/collections/workspace/ws1');
        expect(response.status).toBe(200);
        expect(mockControllers.getCollectionsByWorkspace).toHaveBeenCalled();
    });

    test('DELETE /collections/:collectionId should call deleteCollection', async () => {
        const response = await request(app).delete('/collections/coll1');
        expect(response.status).toBe(200);
        expect(mockControllers.deleteCollection).toHaveBeenCalled();
    });

    test('POST /collections/:collectionId/duplicate should call duplicateCollection', async () => {
        const response = await request(app).post('/collections/coll1/duplicate');
        expect(response.status).toBe(201);
        expect(mockControllers.duplicateCollection).toHaveBeenCalled();
    });
});