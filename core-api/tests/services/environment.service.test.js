import { jest } from '@jest/globals';
import httpStatus from 'http-status';
import ApiError from '../../src/utils/ApiError.js';

// Mocks
const mockPrisma = {
    environment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
    },
    userEnvironment: {
        createMany: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
    },
    workspace: {
        findUnique: jest.fn(),
    },
    environmentVariable: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    workspaceMember: {
        findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
};

const mockEncryption = {
    encrypt: jest.fn((v) => `enc_${v}`),
    decrypt: jest.fn((v) => v.replace('enc_', '')),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
    default: mockPrisma,
}));

jest.unstable_mockModule('../../src/utils/encryption.js', () => ({
    encrypt: mockEncryption.encrypt,
    decrypt: mockEncryption.decrypt,
}));

// Import service after mocking
const { environmentService } = await import('../../src/services/environment.service.js');

describe('Environment Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createEnvironment', () => {
        test('should create environment and link users', async () => {
            const envData = { name: 'Dev', isPersistent: false };
            mockPrisma.environment.create.mockResolvedValue({ id: 'env1', ...envData });
            mockPrisma.workspace.findUnique.mockResolvedValue({ id: 'ws1', ownerId: 'owner1', members: [] });

            const result = await environmentService.createEnvironment('ws1', 'user1', envData);

            expect(mockPrisma.environment.create).toHaveBeenCalled();
            expect(mockPrisma.userEnvironment.createMany).toHaveBeenCalled();
            expect(result.id).toBe('env1');
        });
    });

    describe('getWorkspaceEnvironments', () => {
        test('should return environments with decrypted values', async () => {
            const envs = [{
                id: 'env1',
                variables: [{ key: 'K1', value: 'enc_V1', isSecret: false }]
            }];
            mockPrisma.environment.findMany.mockResolvedValue(envs);

            const result = await environmentService.getWorkspaceEnvironments('ws1', 'user1');

            expect(result[0].variables[0].value).toBe('V1');
            expect(mockEncryption.decrypt).toHaveBeenCalled();
        });

        test('should hide secret variable values', async () => {
            const envs = [{
                id: 'env1',
                variables: [{ key: 'S1', value: 'enc_secret', isSecret: true }]
            }];
            mockPrisma.environment.findMany.mockResolvedValue(envs);

            const result = await environmentService.getWorkspaceEnvironments('ws1', 'user1');

            expect(result[0].variables[0].value).toBe('********');
        });
    });

    describe('createVariable', () => {
        test('should encrypt and save variable', async () => {
            mockPrisma.environment.findUnique.mockResolvedValue({ id: 'env1', isPersistent: false });
            mockPrisma.userEnvironment.findUnique.mockResolvedValue({ id: 'ue1' });
            mockPrisma.environmentVariable.create.mockResolvedValue({ key: 'K1' });

            await environmentService.createVariable('env1', 'user1', { key: 'K1', value: 'V1', isSecret: false });

            expect(mockEncryption.encrypt).toHaveBeenCalledWith('V1');
            expect(mockPrisma.environmentVariable.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ value: 'enc_V1' })
            }));
        });
    });
});
