import { jest } from '@jest/globals';
import EventEmitter from 'events';

// Mocks
const mockHttp = {
  request: jest.fn(),
};

const mockHttps = {
  request: jest.fn(),
};

jest.unstable_mockModule('http', () => ({
  default: {
      ...mockHttp,
      IncomingMessage: class IncomingMessage extends EventEmitter { constructor() { super(); this.headers = {}; } }
  }
}));

jest.unstable_mockModule('https', () => ({
  default: {
      ...mockHttps,
      IncomingMessage: class IncomingMessage extends EventEmitter { constructor() { super(); this.headers = {}; } }
  }
}));

// Import service after mocking
const { executeHttpRequest } = await import('../../src/services/http-runner.service.js');

describe('Http Runner Service', () => {
    let mockRequest;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRequest = new EventEmitter();
        mockRequest.write = jest.fn();
        mockRequest.end = jest.fn();
        
        mockHttp.request.mockReturnValue(mockRequest);
        mockHttps.request.mockReturnValue(mockRequest);
    });

    test('should execute GET request successfully', async () => {
        const config = { url: 'http://example.com' };
        
        const promise = executeHttpRequest(config);
        
        // Simulate Socket events
        const mockSocket = new EventEmitter();
        mockRequest.emit('socket', mockSocket);
        mockSocket.emit('lookup');
        mockSocket.emit('connect');

        // Simulate Response
        const mockResponse = new EventEmitter();
        mockResponse.statusCode = 200;
        mockResponse.statusMessage = 'OK';
        // Ensure headers property is enumerable and defined
        Object.defineProperty(mockResponse, 'headers', {
            value: { 'content-type': 'application/json' },
            writable: true,
            enumerable: true
        });
        
        mockRequest.emit('response', mockResponse);
        
        mockResponse.emit('data', Buffer.from(JSON.stringify({ message: 'Success' })));
        mockResponse.emit('end');

        const result = await promise;

        expect(result.success).toBe(true);
        expect(result.status).toBe(200);
        expect(result.data).toEqual({ message: 'Success' });
        expect(mockHttp.request).toHaveBeenCalled();
    });
    
    // ... other tests with fresh mockRequest
    test('should handle HTTPS request', async () => {
        const config = { url: 'https://secure.example.com' };

        const promise = executeHttpRequest(config);
        
        const mockSocket = new EventEmitter();
        mockRequest.emit('socket', mockSocket);
        mockSocket.emit('lookup');
        mockSocket.emit('connect');
        mockSocket.emit('secureConnect');

        const mockResponse = new EventEmitter();
        mockResponse.statusCode = 200;
        mockResponse.headers = {};
        
        mockRequest.emit('response', mockResponse);
        mockResponse.emit('end');

        const result = await promise;

        expect(mockHttps.request).toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    test('should handle request errors', async () => {
        const config = { url: 'http://error.example.com' };
        
        const promise = executeHttpRequest(config);

        mockRequest.emit('error', new Error('Network Error'));

        const result = await promise;

        expect(result.success).toBe(false);
        expect(result.data.error).toBe('Network Error');
    });

    test('should include body in request', async () => {
        const config = { 
            url: 'http://api.example.com', 
            method: 'POST', 
            body: { key: 'value' } 
        };

        const promise = executeHttpRequest(config);
        
        const mockResponse = new EventEmitter();
        // Ensure headers property is enumerable and defined
        Object.defineProperty(mockResponse, 'headers', {
            value: {},
            writable: true,
            enumerable: true
        });

        mockRequest.emit('response', mockResponse);
        mockResponse.emit('end');
        
        await promise;

        expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify(config.body));
    });
});
