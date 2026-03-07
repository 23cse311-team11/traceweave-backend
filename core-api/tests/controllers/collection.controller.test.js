import { jest } from '@jest/globals';
import httpStatus from 'http-status';

// Mocks
const mockCollectionService = {
    createCollection: jest.fn(),
    getCollectionsByWorkspace: jest.fn(),
    softDeleteCollection: jest.fn(),
    updateCollection: jest.fn(),
};

jest.unstable_mockModule('../../src/services/collection.service.js', () => ({
    CollectionService: mockCollectionService,
}));

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
    default: {
        collection: { findUnique: jest.fn() }
    }
}));

// Import controller
const {
    createCollection,
    getCollectionsByWorkspace,
    deleteCollection,
    updateCollection
} = await import('../../src/controllers/collection.controller.js');

describe('Collection Controller', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            user: { id: 'user1' },
            params: {},
            body: {},
        };
        res = {
            status: jest.fn(function () { return this; }),
            send: jest.fn(function () { return this; }),
            json: jest.fn(function () { return this; }),
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('createCollection', () => {
        test('should create collection and return 201', async () => {
            req.params.workspaceId = 'ws1';
            req.body = { name: 'New Coll' };
            const collection = { id: 'coll1', name: 'New Coll' };
            mockCollectionService.createCollection.mockResolvedValue(collection);

            await createCollection(req, res, next);

            expect(res.status).toHaveBeenCalledWith(httpStatus.CREATED);
            expect(res.send).toHaveBeenCalledWith(collection);
        });
    });

    describe('getCollectionsByWorkspace', () => {
        test('should return collections and 200', async () => {
            req.params.workspaceId = 'ws1';
            const collections = [{ id: 'coll1' }];
            mockCollectionService.getCollectionsByWorkspace.mockResolvedValue(collections);

            await getCollectionsByWorkspace(req, res, next);

            expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
            expect(res.send).toHaveBeenCalledWith(collections);
        });
    });

    describe('deleteCollection', () => {
        test('should delete collection and return result', async () => {
            req.params.collectionId = 'coll1';
            const result = { success: true };
            mockCollectionService.softDeleteCollection.mockResolvedValue(result);

            await deleteCollection(req, res, next);

            expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
            expect(res.send).toHaveBeenCalledWith(result);
        });
    });
});
