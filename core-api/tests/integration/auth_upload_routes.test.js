import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import httpStatus from 'http-status';

// --------------------
// Service Mocks
// --------------------
const mockAuthService = {
    createUser: jest.fn(),
    loginUserWithEmailAndPassword: jest.fn(),
    getUserById: jest.fn(),
};

const mockTokenService = {
    generateAuthTokens: jest.fn().mockResolvedValue({
        access: { token: 'mock-token', expires: new Date(Date.now() + 3600000) }
    }),
};

const mockCookieService = {
    clearUserCookies: jest.fn().mockResolvedValue(),
};

// Mock Auth Service
jest.unstable_mockModule('../../src/services/auth.service.js', () => ({
    createUser: mockAuthService.createUser,
    loginUserWithEmailAndPassword: mockAuthService.loginUserWithEmailAndPassword,
    getUserById: mockAuthService.getUserById
}));

// Mock Token Service
jest.unstable_mockModule('../../src/services/token.service.js', () => ({
    generateAuthTokens: mockTokenService.generateAuthTokens
}));

// Mock Cookie Service
jest.unstable_mockModule('../../src/services/cookie.service.js', () => ({
    clearUserCookies: mockCookieService.clearUserCookies
}));

// Mock Passport (used in callback)
jest.unstable_mockModule('passport', () => ({
    default: {
        authenticate: jest.fn(() => (req, res, next) => next()),
        initialize: jest.fn(() => (req, res, next) => next()),
        session: jest.fn(() => (req, res, next) => next()),
    }
}));

// Mock Auth Middleware
const mockAuthMiddleware = jest.fn((req, res, next) => {
    req.user = { id: 'user123' };
    next();
});

jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

// Mock Cloudinary Config (Multer)
const mockUploadMiddleware = {
    single: jest.fn(() => (req, res, next) => {
        req.file = { path: 'http://cloud.res/test.png', filename: 'test' };
        next();
    }),
};

jest.unstable_mockModule('../../src/config/cloudinary.js', () => ({
    cloudinary: { config: jest.fn() },
    upload: mockUploadMiddleware
}));

// Finalize Auth and Upload Routers
const { default: authRouter } = await import('../../src/routes/auth.routes.js');
const { default: uploadRouter } = await import('../../src/routes/upload.routes.js');

describe('Auth & Upload Routes Integration', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api/v1/auth', authRouter);
        app.use('/api/v1/upload', uploadRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/v1/auth/register', () => {
        test('should register a new user and set cookie', async () => {
            const userData = { email: 'test@example.com', password: 'Password123', name: 'Test User' };
            mockAuthService.createUser.mockResolvedValue({ id: 'u1', ...userData });

            const response = await request(app)
                .post('/api/v1/auth/register')
                .send(userData);

            expect(response.status).toBe(201);
            expect(response.body.user.email).toBe('test@example.com');
            expect(response.headers['set-cookie'][0]).toContain('token=mock-token');
        });

        test('should return 400 for invalid email', async () => {
            const response = await request(app)
                .post('/api/v1/auth/register')
                .send({ email: 'bad-email', password: 'p1', name: 'u' });
            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/v1/auth/login', () => {
        test('should login and set cookie', async () => {
            mockAuthService.loginUserWithEmailAndPassword.mockResolvedValue({ id: 'u1', email: 't@e.com', fullName: 'T' });

            const response = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 't@e.com', password: 'p1' });

            expect(response.status).toBe(200);
            expect(response.headers['set-cookie'][0]).toContain('token=mock-token');
        });
    });

    describe('POST /api/v1/upload', () => {
        test('should upload a file and return URL', async () => {
            // Need to mock auth middleware for this route since we aren't using the real one
            // Wait, authRouter and uploadRouter use separate instances of the mock?
            // No, the unstable_mockModule is shared.

            // Note: The /upload route uses authenticateUser middleware which we should've mocked.
            // In uploadRouter import, it uses ../middlewares/auth.middleware.js.
            // Let's ensure it's mocked.
            const response = await request(app)
                .post('/api/v1/upload')
                // Attach a dummy file to satisfy multer-like expectation in test (even though we mock the middleware)
                .attach('file', Buffer.from('test'), 'test.png');

            expect(response.status).toBe(200);
            expect(response.body.url).toBe('http://cloud.res/test.png');
        });
    });
});
