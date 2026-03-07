import { jest } from '@jest/globals';
import httpStatus from 'http-status';
import ApiError from '../../src/utils/ApiError.js';

// Mocks
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  identity: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn((callback) => callback(mockPrisma)),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

const mockBcrypt = {
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: jest.fn(),
};

jest.unstable_mockModule('bcryptjs', () => ({
  default: mockBcrypt,
}));

const mockEmailService = {
  sendEmail: jest.fn().mockImplementation(() => Promise.resolve(true)),
};

jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendEmail: mockEmailService.sendEmail,
}));

// Import service after mocking
const { 
  createUser, 
  loginUserWithEmailAndPassword, 
  findOrCreateUser, 
  getUserById 
} = await import('../../src/services/auth.service.js');


describe('Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    const userBody = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    };

    test('should create a user successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 1, ...userBody });
      mockPrisma.identity.create.mockResolvedValue({ id: 1 });

      const user = await createUser(userBody);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: userBody.email } });
      expect(mockBcrypt.genSalt).toHaveBeenCalled();
      expect(mockBcrypt.hash).toHaveBeenCalledWith(userBody.password, 'salt');
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockPrisma.identity.create).toHaveBeenCalled();
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
      expect(user).toBeDefined();
    });

    test('should throw error if email already taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });

      await expect(createUser(userBody)).rejects.toThrow(ApiError);
      await expect(createUser(userBody)).rejects.toThrow('Email already taken');
    });
  });

  describe('loginUserWithEmailAndPassword', () => {
    const email = 'test@example.com';
    const password = 'password123';
    const user = {
      id: 1,
      email,
      identities: [
        { provider: 'email', passwordHash: 'hashedPassword' }
      ]
    };

    test('should return user if credentials are correct', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(true);

      const result = await loginUserWithEmailAndPassword(email, password);

      expect(result).toEqual(user);
    });

    test('should throw error if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(loginUserWithEmailAndPassword(email, password)).rejects.toThrow(ApiError);
    });

    test('should throw error if password incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(false);

      await expect(loginUserWithEmailAndPassword(email, password)).rejects.toThrow(ApiError);
    });
    
    test('should throw error if no email identity found', async () => {
        const userNoEmail = { ...user, identities: [] };
        mockPrisma.user.findUnique.mockResolvedValue(userNoEmail);
  
        await expect(loginUserWithEmailAndPassword(email, password)).rejects.toThrow(ApiError);
      });
  });

  describe('findOrCreateUser', () => {
    const email = 'test@example.com';
    const provider = 'google';
    const providerId = '12345';
    const profileData = { fullName: 'Test User', avatarUrl: 'http://example.com/avatar.jpg' };

    test('should return existing identity user', async () => {
      const existingUser = { id: 1, email };
      mockPrisma.identity.findUnique.mockResolvedValue({ user: existingUser });

      const user = await findOrCreateUser(email, provider, providerId, profileData);

      expect(user).toEqual(existingUser);
    });

    test('should create new user if not exists', async () => {
      mockPrisma.identity.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const newUser = { id: 2, email, ...profileData };
      mockPrisma.user.create.mockResolvedValue(newUser);

      const user = await findOrCreateUser(email, provider, providerId, profileData);

      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
      expect(mockPrisma.identity.create).toHaveBeenCalled();
      expect(user).toEqual(newUser);
    });

    test('should link identity if user exists but identity does not', async () => {
      mockPrisma.identity.findUnique.mockResolvedValue(null);
      const existingUser = { id: 1, email };
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      const user = await findOrCreateUser(email, provider, providerId, profileData);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.identity.create).toHaveBeenCalledWith({
        data: {
            userId: existingUser.id,
            provider,
            providerId
        }
      });
      expect(user).toEqual(existingUser);
    });
  });

  describe('getUserById', () => {
    test('should return user by id', async () => {
      const user = { id: 1, email: 'test@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await getUserById(1);

      expect(result).toEqual(user);
    });
  });
});
