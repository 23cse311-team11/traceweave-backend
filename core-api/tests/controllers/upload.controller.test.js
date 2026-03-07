import { jest } from '@jest/globals';
import httpMocks from 'node-mocks-http';
import { uploadFile } from '../../src/controllers/upload.controller.js';

describe('Upload Controller', () => {
    let req, res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        jest.spyOn(console, 'error').mockImplementation(() => {}); 
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should return 400 if no file uploaded', () => {
        uploadFile(req, res);

        expect(res.statusCode).toBe(400);
        expect(res._getJSONData()).toEqual({ error: 'No file uploaded' });
    });

    test('should return 200 and file details if file uploaded', () => {
        const file = {
            path: 'https://cloudinary.com/file.jpg',
            filename: 'file.jpg',
        };
        req.file = file;

        uploadFile(req, res);

        expect(res.statusCode).toBe(200);
        expect(res._getJSONData()).toEqual({
            message: 'File uploaded successfully',
            url: file.path,
            filename: file.filename,
        });
    });

    test('should return 500 on error', () => {
         // Force an error by making req.file access throw, or simpler: mock res.status to throw
         const error = new Error('Test Error');
         res.status = jest.fn().mockImplementation(() => { throw error; });
         // We need to spy on status to verify 500 is called after the exception in the catch block? 
         // No, if logic allows injection.
         // Actually, the simplest way to test the catch block in this specific function:
         // The function is:
         // try { if(!req.file) ... } catch ...
         // We can make `req` a proxy that throws on property access?
         
         const reqThrow = new Proxy({}, {
             get: () => { throw new Error('Proxy error'); }
         });
         
         // Re-create res because previous mock might be affected
         const res2 = httpMocks.createResponse();
         
         uploadFile(reqThrow, res2);
         
         expect(res2.statusCode).toBe(500);
         expect(res2._getJSONData()).toEqual({ error: 'File upload failed' });
    });
});
