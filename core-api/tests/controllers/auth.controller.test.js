import { jest } from '@jest/globals';
import httpStatus from 'http-status';

// --------------------
// Mocks
// --------------------
const mockAuthService = {
  createUser: jest.fn(),
  loginUserWithEmailAndPassword: jest.fn(),
  getUserById: jest.fn(),
  updateUser: jest.fn(),
};

const mockTokenService = {
  generateAuthTokens: jest.fn(),
};

const mockCookieService = {
  clearUserCookies: jest.fn(),
};

// 1. Keep Config Simple (As it was in your first run)
const mockConfig = {
  env: 'development',
};

// Mock modules
jest.unstable_mockModule('../../src/services/auth.service.js', () => mockAuthService);
jest.unstable_mockModule('../../src/services/token.service.js', () => mockTokenService);
jest.unstable_mockModule('../../src/services/cookie.service.js', () => mockCookieService);
jest.unstable_mockModule('../../src/config/config.js', () => ({ default: mockConfig }));

// Import controller
const { register, login, getMe, updateProfile, logout } = await import(
  '../../src/controllers/auth.controller.js'
);

describe('Auth Controller', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    
    // 2. Setup Response Mock
    // Support chaining: res.status().send() and res.status().json()
    res = {
      status: jest.fn(function() { return this; }), // Returns 'res' for chaining
      send: jest.fn(function() { return this; }),
      json: jest.fn(function() { return this; }),
      cookie: jest.fn(function() { return this; }), 
      clearCookie: jest.fn(function() { return this; }),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  // --------------------
  // REGISTER
  // --------------------
  describe('register', () => {
    test('should register user and set cookie', async () => {
      req.body = { email: 'test@example.com', password: 'password', name: 'Test' };

      const user = { id: 'user1', email: 'test@example.com', fullName: 'Test' };
      
      // 3. Robust Token Mock
      // We include both access and refresh tokens to prevent crashes if the controller expects them.
      const tokens = {
        access: {
          token: 'accessToken123',
          expires: new Date(Date.now() + 100000), 
        },
        refresh: {
          token: 'refreshToken123',
          expires: new Date(Date.now() + 200000),
        },
      };

      mockAuthService.createUser.mockResolvedValue(user);
      mockTokenService.generateAuthTokens.mockResolvedValue(tokens);

      await register(req, res, next);

      expect(mockAuthService.createUser).toHaveBeenCalledWith(req.body);
      expect(mockTokenService.generateAuthTokens).toHaveBeenCalledWith(user);

      // Verify Cookie
      expect(res.cookie).toHaveBeenCalledWith(
        'token',
        tokens.access.token,
        expect.objectContaining({
          httpOnly: true,
        })
      );

      expect(res.status).toHaveBeenCalledWith(httpStatus.CREATED);
      
      // Controller uses res.send(), not res.json()
      expect(res.send).toHaveBeenCalledWith({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.fullName,
        },
      });
    });
  });

  // --------------------
  // LOGIN
  // --------------------
  describe('login', () => {
    test('should login user and set cookie', async () => {
      req.body = { email: 'test@example.com', password: 'password' };

      const user = { id: 'user1', email: 'test@example.com', fullName: 'Test' };
      
      const tokens = {
        access: {
          token: 'accessToken123',
          expires: new Date(Date.now() + 100000),
        },
        refresh: {
          token: 'refreshToken123',
          expires: new Date(Date.now() + 200000),
        },
      };

      mockAuthService.loginUserWithEmailAndPassword.mockResolvedValue(user);
      mockTokenService.generateAuthTokens.mockResolvedValue(tokens);

      await login(req, res, next);

      expect(
        mockAuthService.loginUserWithEmailAndPassword
      ).toHaveBeenCalledWith(req.body.email, req.body.password);

      expect(res.cookie).toHaveBeenCalledWith(
        'token',
        tokens.access.token,
        expect.any(Object)
      );

      // Controller uses res.send(), not res.json()
      expect(res.send).toHaveBeenCalledWith({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.fullName,
        },
      });
    });
  });

  // --------------------
  // GET ME
  // --------------------
  describe('getMe', () => {
    test('should return user if authenticated', async () => {
      req.user = { id: 'user1' };
      const user = { id: 'user1', email: 'test@example.com' };

      mockAuthService.getUserById.mockResolvedValue(user);

      await getMe(req, res, next);

      expect(mockAuthService.getUserById).toHaveBeenCalledWith('user1');
      expect(res.json).toHaveBeenCalledWith({
        isAuthenticated: true,
        user,
      });
    });

    test('should return 404 if user not found', async () => {
      req.user = { id: 'user1' };
      mockAuthService.getUserById.mockResolvedValue(null);

      await getMe(req, res, next);

      expect(res.status).toHaveBeenCalledWith(httpStatus.NOT_FOUND);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User not found',
        isAuthenticated: false,
      });
    });
  });

  // --------------------
  // LOGOUT
  // --------------------
  describe('updateProfile', () => {
    test('should update user profile and return user', async () => {
      req.user = { id: 'user1' };
      req.body = { fullName: 'New Name', avatarUrl: 'http://new.jpg' };
      const updatedUser = { id: 'user1', fullName: 'New Name', avatarUrl: 'http://new.jpg' };

      mockAuthService.updateUser.mockResolvedValue(updatedUser);

      await updateProfile(req, res, next);

      expect(mockAuthService.updateUser).toHaveBeenCalledWith('user1', {
        fullName: 'New Name',
        avatarUrl: 'http://new.jpg'
      });
      expect(res.json).toHaveBeenCalledWith({
        isAuthenticated: true,
        user: updatedUser,
      });
    });
  });

  // --------------------
  // LOGOUT
  // --------------------
  describe('logout', () => {
    test('should clear cookies and user session', async () => {
      req.user = { id: 'user1' };

      await logout(req, res, next);

      expect(res.clearCookie).toHaveBeenCalledWith('token');
      expect(mockCookieService.clearUserCookies).toHaveBeenCalledWith('user1');
      expect(res.json).toHaveBeenCalledWith({
        message: 'Logged out successfully',
      });
    });
  });
});