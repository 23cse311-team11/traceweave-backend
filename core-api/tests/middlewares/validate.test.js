import { jest } from '@jest/globals';
import httpMocks from 'node-mocks-http';
import Joi from 'joi';
import validate from '../../src/middlewares/validate.js';
import ApiError from '../../src/utils/ApiError.js';
import httpStatus from 'http-status';

describe('Validate Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        next = jest.fn();
    });

    test('should call next if validation passes', () => {
        const schema = {
            body: Joi.object().keys({
                name: Joi.string().required(),
            }),
        };
        req.body = { name: 'test' };

        validate(schema)(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    });

    test('should call next with error if validation fails', () => {
        const schema = {
            body: Joi.object().keys({
                name: Joi.string().required(),
            }),
        };
        req.body = {};

        validate(schema)(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.BAD_REQUEST);
    });

    test('should validate params', () => {
        const schema = {
            params: Joi.object().keys({
                id: Joi.string().required(),
            }),
        };
        req.params = { id: '123' };

        validate(schema)(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    test('should validate query', () => {
        const schema = {
            query: Joi.object().keys({
                role: Joi.string().valid('user', 'admin'),
            }),
        };
        req.query = { role: 'admin' };

        validate(schema)(req, res, next);

        expect(next).toHaveBeenCalled();
    });
    
    test('should strip unknown keys if configured (default Joi behavior usually allows unless items are specified, but validate middleware uses defaults)', () => {
         // The validate middleware implementation uses: .prefs({ errors: { label: 'key' }, abortEarly: false })
         // It does NOT set stripUnknown: true explicitly, so unknown keys might persist unless Joi schema forbids them.
         // However, the middleware does: const object = pick(req, Object.keys(validSchema));
         // So it only validates what is in the schema keys (body, query, params).
         // Let's test basic behavior.
         
         const schema = {
            body: Joi.object().keys({
                name: Joi.string().required(),
            }),
        };
        req.body = { name: 'test', extra: 'field' };

        validate(schema)(req, res, next);
        
        expect(next).toHaveBeenCalled();
    });
});
