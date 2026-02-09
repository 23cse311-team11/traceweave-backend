import { jest } from '@jest/globals';
import { Cookie } from 'tough-cookie';

// Mock the model before importing the service
const mockCookieJarModel = {
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteMany: jest.fn(),
};

jest.unstable_mockModule('../../src/models/cookie-jar.model.js', () => ({
  default: mockCookieJarModel,
}));

// Import the service after mocking
const { loadCookieJar, persistCookieJar, clearUserCookies } = await import('../../src/services/cookie.service.js');

describe('Cookie Service', () => {
  const userId = 'user123';
  const workspaceId = 'workspace123';
  const domain = 'example.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadCookieJar', () => {
    test('should load cookies from database into jar', async () => {
      const storedCookies = [
        {
          key: 'session',
          value: '123',
          domain: 'example.com',
          path: '/',
          raw: {
            key: 'session',
            value: '123',
            domain: 'example.com',
            path: '/',
          },
        },
      ];

      mockCookieJarModel.find.mockResolvedValue(storedCookies);

      const jar = await loadCookieJar(userId, workspaceId, domain);
      
      const cookies = await jar.getCookies('https://example.com');
      expect(cookies).toHaveLength(1);
      expect(cookies[0].key).toBe('session');
      expect(cookies[0].value).toBe('123');
      expect(mockCookieJarModel.find).toHaveBeenCalledWith({
        userId,
        workspaceId,
        domain: { $in: ['example.com', '.example.com'] },
      });
    });

    test('should handle subdomains gracefully', async () => {
        const subDomain = 'api.example.com';
        mockCookieJarModel.find.mockResolvedValue([]);
        
        await loadCookieJar(userId, workspaceId, subDomain);

        expect(mockCookieJarModel.find).toHaveBeenCalledWith({
            userId,
            workspaceId,
            domain: { $in: ['api.example.com', '.api.example.com', 'example.com', '.example.com'] },
        });
    });
  });

  describe('persistCookieJar', () => {
    test('should save cookies from jar to database', async () => {
       // Create a real jar and put a cookie in it
       const { CookieJar } = await import('tough-cookie');
       const jar = new CookieJar();
       const cookie = new Cookie({
         key: 'token',
         value: 'abc',
         domain: 'example.com',
         path: '/',
       });
       await jar.setCookie(cookie, 'https://example.com');

       mockCookieJarModel.findOneAndUpdate.mockResolvedValue({});

       await persistCookieJar(jar, userId, workspaceId, 'https://example.com/api');

       expect(mockCookieJarModel.findOneAndUpdate).toHaveBeenCalledWith(
         {
           userId,
           workspaceId,
           domain: 'example.com',
           key: 'token',
           path: '/',
         },
         expect.objectContaining({
            userId,
            workspaceId,
            domain: 'example.com',
            key: 'token',
            value: 'abc',
         }),
         { upsert: true, new: true }
       );
    });
  });

  describe('clearUserCookies', () => {
    test('should delete all cookies for a user', async () => {
      mockCookieJarModel.deleteMany.mockResolvedValue({ deletedCount: 5 });

      await clearUserCookies(userId);

      expect(mockCookieJarModel.deleteMany).toHaveBeenCalledWith({ userId });
    });
  });
});
