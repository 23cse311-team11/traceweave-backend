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
        PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {}
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
            jest.spyOn(console, 'error').mockImplementation(() => {});
        });
        
        afterEach(() => {
            jest.clearAllMocks();
        });

        test('should send proper error response and put the error message in res.locals', () => {
            const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error');
            const res = httpMocks.createResponse();
            const sendSpy = jest.spyOn(res, 'send');


            errorHandler(error, req, res, next);

            expect(res.locals.errorMessage).toBe(error.message);
            expect(res.statusCode).toBe(httpStatus.BAD_REQUEST);
            expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
                code: httpStatus.BAD_REQUEST,
                message: error.message,
                stack: error.stack,
            }));
        });

        test('should put the stack in the response if in development mode', () => {
            mockConfig.env = 'development';
            const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error');
            const res = httpMocks.createResponse();
             const sendSpy = jest.spyOn(res, 'send');

            errorHandler(error, req, res, next);

            expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
                code: httpStatus.BAD_REQUEST,
                message: error.message, 
                stack: error.stack
            }));
        });

        test('should NOT put the stack in the response if in production mode', () => {
             mockConfig.env = 'production';
             const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error');
             const res = httpMocks.createResponse();
             const sendSpy = jest.spyOn(res, 'send');

             errorHandler(error, req, res, next);

             expect(sendSpy).toHaveBeenCalledWith(expect.not.objectContaining({
                 stack: expect.anything()
             }));
        });
    });
});
