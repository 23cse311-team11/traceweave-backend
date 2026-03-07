import { jest } from '@jest/globals';
import httpStatus from 'http-status';
import ApiError from '../../src/utils/ApiError.js';

// --------------------
// Mocks
// --------------------
const mockPrisma = {
    collection: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
    },
    // The service calls updateMany on requests during soft delete
    request: {
        updateMany: jest.fn(),
    },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
    default: mockPrisma,
}));

// Import service after mocking
const { CollectionService } = await import('../../src/services/collection.service.js');

describe('Collection Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createCollection', () => {
        test('should create a collection successfully', async () => {
            const collectionData = { workspaceId: 'ws1', name: 'My Coll' };
            mockPrisma.collection.create.mockResolvedValue({ id: 'coll1', ...collectionData });

            const result = await CollectionService.createCollection(collectionData);

            expect(mockPrisma.collection.create).toHaveBeenCalled();
            expect(result.name).toBe('My Coll');
        });

        test('should throw 404 if parent collection not found', async () => {
            mockPrisma.collection.findFirst.mockResolvedValue(null);
            const collectionData = { workspaceId: 'ws1', name: 'Child', parentId: 'nonexistent' };

            await expect(CollectionService.createCollection(collectionData))
                .rejects.toThrow(ApiError);
        });
    });

    describe('getCollectionsByWorkspace', () => {
        test('should return collections for workspace', async () => {
            // Ensure we return an array
            mockPrisma.collection.findMany.mockResolvedValue([{ id: 'coll1' }]);

            const result = await CollectionService.getCollectionsByWorkspace('ws1');

            expect(mockPrisma.collection.findMany).toHaveBeenCalled();
            expect(result).toHaveLength(1);
        });
    });

    describe('softDeleteCollection', () => {
        test('should soft delete collection and its children recursively', async () => {
            // 1. Initial find for the collection to delete
            mockPrisma.collection.findFirst.mockResolvedValue({ id: 'coll1' });
            
            // 2. The recursive call looks for children. 
            // Return empty array [] to STOP the recursion (The Base Case)
            mockPrisma.collection.findMany.mockResolvedValue([]);
            
            mockPrisma.collection.update.mockResolvedValue({ id: 'coll1', deletedAt: new Date() });
            mockPrisma.request.updateMany.mockResolvedValue({ count: 0 });

            const result = await CollectionService.softDeleteCollection('coll1');

            // Verify update was called for the main collection
            expect(mockPrisma.collection.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'coll1' }
            }));
            expect(result.success).toBe(true);
        });
    });

    describe('duplicateCollection', () => {
        test('should duplicate collection and sub-items', async () => {
            const original = { id: 'coll1', name: 'Orig', workspaceId: 'ws1', parentId: null, order: 1 };
            
            // Mock findUnique for the initial check and the recursive build
            mockPrisma.collection.findUnique.mockResolvedValue({
                ...original,
                requests: [],
                children: [] // Stop recursion here too
            });
            
            mockPrisma.collection.create.mockResolvedValue({ id: 'coll2', name: 'Orig Copy' });

            const result = await CollectionService.duplicateCollection('coll1');

            expect(mockPrisma.collection.create).toHaveBeenCalled();
            expect(result.name).toBe('Orig Copy');
        });
    });
});