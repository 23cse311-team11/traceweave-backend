import { substituteVariables } from '../../src/services/variableSubstitution.service.js';

describe('Variable Substitution Service', () => {

    describe('substituteVariables', () => {
        const variables = {
            BASE_URL: 'https://api.example.com',
            USER_ID: '12345',
            API_KEY: 'secret-key',
        };

        test('should substitute URL variables', () => {
            const config = {
                url: '{{BASE_URL}}/users/{{USER_ID}}',
                headers: {},
                params: {},
                body: null,
            };

            const result = substituteVariables(config, variables);
            expect(result.url).toBe('https://api.example.com/users/12345');
        });

        test('should substitute header variables', () => {
            const config = {
                url: 'https://api.example.com',
                headers: {
                    'Authorization': 'Bearer {{API_KEY}}',
                    'X-User-ID': '{{USER_ID}}',
                },
                params: {},
                body: null,
            };

            const result = substituteVariables(config, variables);
            expect(result.headers['Authorization']).toBe('Bearer secret-key');
            expect(result.headers['X-User-ID']).toBe('12345');
        });

        test('should substitute query params', () => {
            const config = {
                url: 'https://api.example.com',
                headers: {},
                params: {
                    'user': '{{USER_ID}}',
                    'key': '{{API_KEY}}',
                },
                body: null,
            };

            const result = substituteVariables(config, variables);
            expect(result.params['user']).toBe('12345');
            expect(result.params['key']).toBe('secret-key');
        });

        test('should substitute body string variables', () => {
            const config = {
                url: '{{BASE_URL}}',
                headers: {},
                params: {},
                body: '{"userId": "{{USER_ID}}"}',
            };

            const result = substituteVariables(config, variables);
            expect(result.body).toBe('{"userId": "12345"}');
        });

        test('should return original config if no variables provided', () => {
            const config = {
                url: '{{BASE_URL}}/test',
                headers: {},
                params: {},
                body: null,
            };

            const result = substituteVariables(config, {});
            expect(result.url).toBe('{{BASE_URL}}/test');
        });

        test('should return original config if variables is null', () => {
            const config = {
                url: 'https://api.example.com',
                headers: {},
                params: {},
                body: null,
            };

            const result = substituteVariables(config, null);
            expect(result).toEqual(config);
        });

        test('should throw error when variable not found in environment', () => {
            const config = {
                url: '{{MISSING_VAR}}/test',
                headers: {},
                params: {},
                body: null,
            };

            expect(() => substituteVariables(config, variables)).toThrow(
                "Variable 'MISSING_VAR' not found in environment"
            );
        });

        test('should not mutate original config', () => {
            const config = {
                url: '{{BASE_URL}}/users',
                headers: { 'X-Key': '{{API_KEY}}' },
                params: {},
                body: null,
            };
            const configCopy = JSON.parse(JSON.stringify(config));

            substituteVariables(config, variables);

            expect(config).toEqual(configCopy);
        });
    });
});
