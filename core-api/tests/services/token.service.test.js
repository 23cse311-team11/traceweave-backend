import { jest } from '@jest/globals';
import moment from 'moment';
import jwt from 'jsonwebtoken';

// Mock config
const mockConfig = {
  jwt: {
    secret: 'test-secret',
    accessExpirationMinutes: 30,
  },
};

jest.unstable_mockModule('../../src/config/config.js', () => ({
  default: mockConfig,
}));

// Import service after mocking
const { generateToken, generateAuthTokens } = await import('../../src/services/token.service.js');

describe('Token Service', () => {
    describe('generateToken', () => {
        test('should generate a valid token', () => {
            const userId = 1;
            const expires = moment().add(10, 'minutes');
            const type = 'access';
            
            const token = generateToken(userId, expires, type);
            
            const decoded = jwt.verify(token, mockConfig.jwt.secret);
            expect(decoded.id).toBe(userId);
            expect(decoded.type).toBe(type);
            expect(decoded.exp).toBe(expires.unix());
        });
    });

    describe('generateAuthTokens', () => {
        test('should generate auth tokens', async () => {
            const user = { id: 1 };
            
            const tokens = await generateAuthTokens(user);
            
            expect(tokens).toHaveProperty('access');
            expect(tokens.access).toHaveProperty('token');
            expect(tokens.access).toHaveProperty('expires');
            
            // Verify access token
            const decoded = jwt.verify(tokens.access.token, mockConfig.jwt.secret);
            expect(decoded.id).toBe(user.id);
            expect(decoded.type).toBe('access');
        });
    });
});
