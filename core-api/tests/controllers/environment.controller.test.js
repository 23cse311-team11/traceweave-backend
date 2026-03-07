import { jest } from '@jest/globals';
import httpStatus from 'http-status';

// Mocks
const mockEnvironmentService = {
    createEnvironment: jest.fn(),
    getWorkspaceEnvironments: jest.fn(),
    deleteEnvironment: jest.fn(),
    updateEnvironment: jest.fn(),
    togglePersistent: jest.fn(),
    createVariable: jest.fn(),
    getVariables: jest.fn(),
    updateVariable: jest.fn(),
    renameVariable: jest.fn(),
    deleteVariable: jest.fn(),
};

jest.unstable_mockModule('../../src/services/environment.service.js', () => ({
    environmentService: mockEnvironmentService,
}));

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
    default: {
        environment: { findUnique: jest.fn() }
    }
}));

// Import controller
const {
    createEnvironment,
    getWorkspaceEnvironments,
    deleteEnvironment,
    createVariable,
} = await import('../../src/controllers/environment.controller.js');

describe('Environment Controller', () => {
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

    describe('createEnvironment', () => {
        test('should create environment and return 201', async () => {
            req.params.workspaceId = 'ws1';
            req.body = { name: 'Prod' };
            mockEnvironmentService.createEnvironment.mockResolvedValue({ id: 'env1' });

            await createEnvironment(req, res, next);

            expect(res.status).toHaveBeenCalledWith(httpStatus.CREATED);
            expect(mockEnvironmentService.createEnvironment).toHaveBeenCalled();
        });
    });

    describe('getWorkspaceEnvironments', () => {
        test('should call service and return environments', async () => {
            req.params.workspaceId = 'ws1';
            mockEnvironmentService.getWorkspaceEnvironments.mockResolvedValue([]);

            await getWorkspaceEnvironments(req, res, next);

            expect(res.send).toHaveBeenCalledWith([]);
        });
    });

    describe('createVariable', () => {
        test('should return 201 on success', async () => {
            req.params.environmentId = 'env1';
            mockEnvironmentService.createVariable.mockResolvedValue({ key: 'K1' });

            await createVariable(req, res, next);

            expect(res.status).toHaveBeenCalledWith(httpStatus.CREATED);
        });
    });
});
