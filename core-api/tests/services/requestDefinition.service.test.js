import { jest } from '@jest/globals';
import ApiError from '../../src/utils/ApiError.js';
import httpStatus from 'http-status';

// --------------------
// Mocks
// --------------------
const mockPrisma = {
    collection: {
        findUnique: jest.fn(),
    },
    requestDefinition: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
    },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
    default: mockPrisma,
}));

// Import service after mocks
const { requestDefinitionService } = await import('../../src/services/requestDefinition.service.js');

describe('Request Definition Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─── createRequest ────────────────────────────────────────────────────
    describe('createRequest', () => {
        const validData = {
            collectionId: 'coll1',
            name: 'My GET Request',
            protocol: 'http',
            config: { method: 'GET', url: 'https://api.example.com/users' },
        };

        test('should create a request definition successfully', async () => {
            mockPrisma.collection.findUnique.mockResolvedValue({ id: 'coll1' });
            mockPrisma.requestDefinition.create.mockResolvedValue({ id: 'req1', ...validData });

            const result = await requestDefinitionService.createRequest(validData);

            expect(mockPrisma.collection.findUnique).toHaveBeenCalledWith({
                where: { id: 'coll1', deletedAt: null }
            });
            expect(mockPrisma.requestDefinition.create).toHaveBeenCalled();
            expect(result).toHaveProperty('id', 'req1');
        });

        test('should throw BAD_REQUEST if collectionId is missing', async () => {
            await expect(
                requestDefinitionService.createRequest({ name: 'Test' })
            ).rejects.toThrow(ApiError);
            await expect(
                requestDefinitionService.createRequest({ name: 'Test' })
            ).rejects.toMatchObject({ statusCode: httpStatus.BAD_REQUEST });
        });

        test('should throw BAD_REQUEST if name is missing', async () => {
            await expect(
                requestDefinitionService.createRequest({ collectionId: 'coll1' })
            ).rejects.toThrow(ApiError);
        });

        test('should throw NOT_FOUND if collection does not exist', async () => {
            mockPrisma.collection.findUnique.mockResolvedValue(null);

            await expect(
                requestDefinitionService.createRequest(validData)
            ).rejects.toMatchObject({ statusCode: httpStatus.NOT_FOUND });
        });

        test('should handle legacy field mapping into config', async () => {
            mockPrisma.collection.findUnique.mockResolvedValue({ id: 'coll1' });
            mockPrisma.requestDefinition.create.mockResolvedValue({ id: 'req1' });

            await requestDefinitionService.createRequest({
                collectionId: 'coll1',
                name: 'Legacy Request',
                method: 'POST',
                url: 'https://api.example.com',
            });

            const createCall = mockPrisma.requestDefinition.create.mock.calls[0][0];
            expect(createCall.data.config.method).toBe('POST');
            expect(createCall.data.config.url).toBe('https://api.example.com');
        });
    });

    // ─── getRequestsByCollection ──────────────────────────────────────────
    describe('getRequestsByCollection', () => {
        test('should return all non-deleted requests for a collection', async () => {
            const requests = [{ id: 'req1' }, { id: 'req2' }];
            mockPrisma.requestDefinition.findMany.mockResolvedValue(requests);

            const result = await requestDefinitionService.getRequestsByCollection('coll1');

            expect(mockPrisma.requestDefinition.findMany).toHaveBeenCalledWith({
                where: { collectionId: 'coll1', deletedAt: null }
            });
            expect(result).toHaveLength(2);
        });
    });

    // ─── updateRequest ────────────────────────────────────────────────────
    describe('updateRequest', () => {
        test('should update a request definition successfully', async () => {
            const existingRequest = { id: 'req1', config: { method: 'GET' } };
            mockPrisma.requestDefinition.findFirst.mockResolvedValue(existingRequest);
            mockPrisma.requestDefinition.update.mockResolvedValue({ id: 'req1', name: 'Updated' });

            const result = await requestDefinitionService.updateRequest('req1', { name: 'Updated' });

            expect(mockPrisma.requestDefinition.update).toHaveBeenCalledWith({
                where: { id: 'req1' },
                data: { name: 'Updated' },
            });
            expect(result).toHaveProperty('name', 'Updated');
        });

        test('should throw NOT_FOUND if request does not exist', async () => {
            mockPrisma.requestDefinition.findFirst.mockResolvedValue(null);

            await expect(
                requestDefinitionService.updateRequest('nonexistent', { name: 'X' })
            ).rejects.toMatchObject({ statusCode: httpStatus.NOT_FOUND });
        });

        test('should merge legacy fields into config', async () => {
            const existingRequest = { id: 'req1', config: { method: 'GET', url: 'http://old.com' } };
            mockPrisma.requestDefinition.findFirst.mockResolvedValue(existingRequest);
            mockPrisma.requestDefinition.update.mockResolvedValue({ id: 'req1' });

            await requestDefinitionService.updateRequest('req1', { method: 'POST', url: 'http://new.com' });

            const updateCall = mockPrisma.requestDefinition.update.mock.calls[0][0];
            expect(updateCall.data.config.method).toBe('POST');
            expect(updateCall.data.config.url).toBe('http://new.com');
        });
    });

    // ─── softDeleteRequest ────────────────────────────────────────────────
    describe('softDeleteRequest', () => {
        test('should set deletedAt on the request', async () => {
            mockPrisma.requestDefinition.findFirst.mockResolvedValue({ id: 'req1' });
            mockPrisma.requestDefinition.update.mockResolvedValue({ id: 'req1', deletedAt: new Date() });

            await requestDefinitionService.softDeleteRequest('req1');

            const updateCall = mockPrisma.requestDefinition.update.mock.calls[0][0];
            expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
        });

        test('should throw NOT_FOUND if request does not exist', async () => {
            mockPrisma.requestDefinition.findFirst.mockResolvedValue(null);

            await expect(
                requestDefinitionService.softDeleteRequest('nonexistent')
            ).rejects.toMatchObject({ statusCode: httpStatus.NOT_FOUND });
        });
    });
});
