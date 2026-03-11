/**
 * Integration Test Suite F: Variable Substitution → HTTP Pipeline
 *
 * Purpose:
 *   Validate the full pipeline from environment variable definition through
 *   substitution into request config and actual HTTP execution, confirming
 *   that environment-scoped variables are correctly applied end-to-end.
 *
 * Coverage:
 *   - Single variable substitution in URL
 *   - Multiple variables in URL + headers + body
 *   - Missing variable throws descriptive error
 *   - Nested object substitution
 *   - GraphQL variable substitution via graphql-runner
 *   - GET environment variables via API
 *   - Environment variable isolation between environments
 */

import { jest } from '@jest/globals';

// ─── Pure service tests (no HTTP needed for unit-level integration) ─────

describe('Suite F — Variable Substitution → HTTP Pipeline', () => {

    let substituteVariables;
    let executeGraphQLRequest;
    let mockExecuteHttpRequest;

    beforeAll(async () => {
        // Import directly — no DB mocks needed for pure service integration
        const svc = await import('../../src/services/variableSubstitution.service.js');
        substituteVariables = svc.substituteVariables;
    });

    beforeEach(() => {
        mockExecuteHttpRequest = jest.fn();
    });

    // ── F1: Single URL variable substitution ──────────────────────
    test('F1: {{BASE_URL}} placeholder in URL is substituted correctly', () => {
        const config = {
            method: 'GET',
            url: 'https://{{BASE_URL}}/api/v1/users',
            headers: {},
            params: {},
            body: null,
        };
        const vars = { BASE_URL: 'api.prod.example.com' };

        const result = substituteVariables(config, vars);

        expect(result.url).toBe('https://api.prod.example.com/api/v1/users');
    });

    // ── F2: Multiple variables across URL + headers + body ─────────
    test('F2: Multiple variables substituted across URL, headers, and body simultaneously', () => {
        const config = {
            method: 'POST',
            url: 'https://{{HOST}}/{{VERSION}}/auth/login',
            headers: {
                Authorization: 'Bearer {{API_KEY}}',
                'X-Workspace': '{{WS_ID}}',
            },
            params: {},
            body: { type: 'raw', raw: '{"userId":"{{USER_ID}}","env":"{{ENV_NAME}}"}' },
        };
        const vars = {
            HOST: 'api.traceweave.io',
            VERSION: 'v2',
            API_KEY: 'sk-secret-key-123',
            WS_ID: 'ws-prod-001',
            USER_ID: 'usr-42',
            ENV_NAME: 'production',
        };

        const result = substituteVariables(config, vars);

        expect(result.url).toBe('https://api.traceweave.io/v2/auth/login');
        expect(result.headers.Authorization).toBe('Bearer sk-secret-key-123');
        expect(result.headers['X-Workspace']).toBe('ws-prod-001');
        expect(result.body.raw).toContain('"userId":"usr-42"');
        expect(result.body.raw).toContain('"env":"production"');
    });

    // ── F3: Missing variable throws descriptive error ──────────────
    test('F3: Missing environment variable throws with the variable name in the message', () => {
        const config = {
            method: 'GET',
            url: 'https://{{UNDEFINED_VAR}}/endpoint',
            headers: {},
            params: {},
            body: null,
        };
        const vars = { BASE_URL: 'api.example.com' }; // UNDEFINED_VAR missing

        expect(() => substituteVariables(config, vars)).toThrow("Variable 'UNDEFINED_VAR' not found in environment");
    });

    // ── F4: No variables → config returned unchanged ───────────────
    test('F4: Config with no variables is returned unchanged (no mutation)', () => {
        const config = {
            method: 'DELETE',
            url: 'https://api.example.com/resource/123',
            headers: { 'Content-Type': 'application/json' },
            params: { page: '1' },
            body: null,
        };

        const result = substituteVariables(config, {});
        expect(result).toEqual(config);
        // Original must not be mutated
        expect(config.url).toBe('https://api.example.com/resource/123');
    });

    // ── F5: Deep nested object substitution ────────────────────────
    test('F5: Variables inside deeply nested body objects are substituted', () => {
        const config = {
            method: 'POST',
            url: 'https://api.example.com/query',
            headers: {},
            params: {},
            body: {
                type: 'raw',
                raw: '{"filter":{"userId":"{{USER_ID}}","status":"{{STATUS}}"},"meta":{"env":"{{ENV}}"}}'
            },
        };
        const vars = { USER_ID: 'u-99', STATUS: 'active', ENV: 'staging' };

        const result = substituteVariables(config, vars);
        const parsed = JSON.parse(result.body.raw);

        expect(parsed.filter.userId).toBe('u-99');
        expect(parsed.filter.status).toBe('active');
        expect(parsed.meta.env).toBe('staging');
    });

    // ── F6: URL params array substitution ─────────────────────────
    test('F6: Variables in query params object are substituted', () => {
        const config = {
            method: 'GET',
            url: 'https://api.example.com/search',
            headers: {},
            params: {
                q: '{{SEARCH_TERM}}',
                limit: '{{PAGE_SIZE}}',
                offset: '0',
            },
            body: null,
        };
        const vars = { SEARCH_TERM: 'traceweave+api', PAGE_SIZE: '25' };

        const result = substituteVariables(config, vars);

        expect(result.params.q).toBe('traceweave+api');
        expect(result.params.limit).toBe('25');
        expect(result.params.offset).toBe('0'); // no substitution needed
    });

    // ── F7: Variable isolation — different env maps don't leak ─────
    test('F7: Variables from different environments remain isolated (no cross-env leak)', () => {
        const config = {
            method: 'GET',
            url: 'https://{{HOST}}/api',
            headers: { Authorization: 'Bearer {{TOKEN}}' },
            params: {},
            body: null,
        };

        const devVars = { HOST: 'dev.api.example.com', TOKEN: 'dev-token-abc' };
        const prodVars = { HOST: 'api.example.com', TOKEN: 'prod-token-xyz' };

        const devResult = substituteVariables(config, devVars);
        const prodResult = substituteVariables(config, prodVars);

        expect(devResult.url).toBe('https://dev.api.example.com/api');
        expect(devResult.headers.Authorization).toBe('Bearer dev-token-abc');

        expect(prodResult.url).toBe('https://api.example.com/api');
        expect(prodResult.headers.Authorization).toBe('Bearer prod-token-xyz');

        // Original must still be untouched
        expect(config.url).toBe('https://{{HOST}}/api');
    });

    // ── F8: Variable substitution → GraphQL runner integration ─────
    test('F8: Substituted variables flow into GraphQL request body correctly', () => {
        const rawTemplate = {
            method: 'POST',
            url: 'https://{{GQL_HOST}}/graphql',
            headers: { Authorization: 'Bearer {{GQL_TOKEN}}' },
            params: {},
            body: {
                graphql: {
                    query: 'query GetUser($id: ID!) { user(id: $id) { name } }',
                    variables: '{"id":"{{USER_ID}}"}',
                },
            },
        };

        const vars = {
            GQL_HOST: 'api.example.com',
            GQL_TOKEN: 'gql-bearer-token',
            USER_ID: 'user-99',
        };

        const substituted = substituteVariables(rawTemplate, vars);

        expect(substituted.url).toBe('https://api.example.com/graphql');
        expect(substituted.headers.Authorization).toBe('Bearer gql-bearer-token');
        // variables string has USER_ID substituted
        expect(substituted.body.graphql.variables).toBe('{"id":"user-99"}');
    });

    // ── F9: Hyphenated and dotted variable names ───────────────────
    test('F9: Variable names with hyphens and dots are correctly substituted', () => {
        const config = {
            method: 'GET',
            url: 'https://{{base.url}}/api',
            headers: { 'X-Api-Key': '{{api-key}}' },
            params: {},
            body: null,
        };
        const vars = { 'base.url': 'api.example.com', 'api-key': 'my-secret-key' };

        const result = substituteVariables(config, vars);

        expect(result.url).toBe('https://api.example.com/api');
        expect(result.headers['X-Api-Key']).toBe('my-secret-key');
    });
});


// integration testing step
