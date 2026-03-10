import { jest } from '@jest/globals';
import httpMocks from 'node-mocks-http';
import httpStatus from 'http-status';

// Mocks
const mockConfig = {
    env: 'development',
};

jest.unstable_mockModule('../../src/config/config.js', () => ({
    default: mockConfig,
}));

// Mock Prisma
const mockPrisma = {
    Prisma: {
        PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error { }
    }
};

jest.unstable_mockModule('@prisma/client', () => mockPrisma);

// Import middleware after mocking
const { errorConverter, errorHandler } = await import('../../src/middlewares/error.js');
const { default: ApiError } = await import('../../src/utils/ApiError.js');

describe('Error Middleware', () => {
    describe('errorConverter', () => {
        let req, res, next;

        beforeEach(() => {
            req = httpMocks.createRequest();
            res = httpMocks.createResponse();
            next = jest.fn();
        });

        test('should return the same ApiError object it was called with', () => {
            const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error');
            errorConverter(error, req, res, next);
            expect(next).toHaveBeenCalledWith(error);
        });

        test('should convert an Error to ApiError', () => {
            const error = new Error('Any error');
            error.statusCode = httpStatus.BAD_REQUEST;

            errorConverter(error, req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(ApiError));
            expect(next.mock.calls[0][0]).toEqual(expect.objectContaining({
                statusCode: httpStatus.BAD_REQUEST,
                message: 'Any error',
                isOperational: false,
            }));
        });

        test('should convert an Error without status to Internal Server Error', () => {
            const error = new Error('Any error');

            errorConverter(error, req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(ApiError));
            expect(next.mock.calls[0][0]).toEqual(expect.objectContaining({
                statusCode: httpStatus.INTERNAL_SERVER_ERROR,
                message: 'Any error',
                isOperational: false,
            }));
        });
    });

    describe('errorHandler', () => {
        let req, res, next;

        beforeEach(() => {
            req = httpMocks.createRequest();
            res = httpMocks.createResponse();
            next = jest.fn();
            res.status = jest.fn().mockReturnValue(res);
            res.send = jest.fn().mockReturnValue(res);
            mockConfig.env = 'development';
            jest.spyOn(console, 'error').mockImplementation(() => { });
        });

        afterEach(() => {
            jest.clearAllMocks();
        });

        test('should send proper error response using res.json', () => {
            const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error');
            const res = httpMocks.createResponse();
            const jsonSpy = jest.spyOn(res, 'json');

            errorHandler(error, req, res, next);

            expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
            expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
                code: httpStatus.BAD_REQUEST,
                message: error.message,
                stack: error.stack,
            }));
        });

        test('should include stack in the response in development mode', () => {
            mockConfig.env = 'development';
            const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error');
            const res = httpMocks.createResponse();
            const jsonSpy = jest.spyOn(res, 'json');

            errorHandler(error, req, res, next);

            expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({
                code: httpStatus.BAD_REQUEST,
                message: error.message,
                stack: error.stack,
            }));
        });

        test('should NOT include stack in the response in production mode', () => {
            mockConfig.env = 'production';
            // isOperational:false => gets mapped to 500 in production
            const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error', false);
            const res = httpMocks.createResponse();
            const jsonSpy = jest.spyOn(res, 'json');

            errorHandler(error, req, res, next);

            expect(jsonSpy).toHaveBeenCalledWith(expect.not.objectContaining({
                stack: expect.anything(),
            }));
        });
    });
});
