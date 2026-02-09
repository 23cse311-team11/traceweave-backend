import { jest } from '@jest/globals';
import httpMocks from 'node-mocks-http';

const mockJwt = {
  verify: jest.fn(),
};

jest.unstable_mockModule('jsonwebtoken', () => ({
  default: mockJwt,
}));

const authenticateUser = (await import('../../src/middlewares/auth.middleware.js')).default;

describe('Auth Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        next = jest.fn();
        jest.clearAllMocks();
        process.env.JWT_SECRET = 'test-secret';
    });

    test('should return 401 if no token provided', () => {
        req.cookies = {};
        
        authenticateUser(req, res, next);
        
        expect(res.statusCode).toBe(401);
        expect(res._getJSONData()).toEqual({ message: 'Not authenticated', isAuthenticated: false });
        expect(next).not.toHaveBeenCalled();
    });

    test('should call next if token is valid', () => {
        const token = 'valid-token';
        const decoded = { id: 'user1', iat: 123, exp: 456 };
        req.cookies = { token };
        mockJwt.verify.mockReturnValue(decoded);

        authenticateUser(req, res, next);

        expect(mockJwt.verify).toHaveBeenCalledWith(token, 'test-secret');
        expect(req.user).toMatchObject({ id: 'user1' });
        expect(next).toHaveBeenCalled();
    });

    test('should return 401 if token is invalid', () => {
        req.cookies = { token: 'invalid-token' };
        mockJwt.verify.mockImplementation(() => { throw new Error('Invalid token'); });

        authenticateUser(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res._getJSONData()).toEqual({ message: 'Invalid token', isAuthenticated: false });
        expect(next).not.toHaveBeenCalled();
    });
});
