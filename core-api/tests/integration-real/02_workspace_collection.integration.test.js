/**
 * Real Integration Test Suite 02: Workspace → Collection → Request Flow
 *
 * Tests the FULL relational data flow through Controller → Service → DB:
 *   - Create workspace: Service creates workspace + OWNER membership
 *   - List workspaces: Filtered by membership
 *   - Create collection under workspace: FK relationship enforced
 *   - Create request under collection: FK chain verified
 *   - Workspace isolation: Users can only see their own workspaces
 *   - Soft-delete: Collections excluded from listings after deletion
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
    buildApp,
    startMongo,
    stopMongo,
    clearMongo,
    uniqueEmail,
    mockPrisma,
    clearPrismaStore,
} from './setup.integration.js';

let app;

beforeAll(async () => {
    await startMongo();
    app = buildApp();
}, 30000);

afterAll(async () => {
    await clearMongo();
    await stopMongo();
}, 15000);

// ── Helper: register + login, return cookie ──────────────────────
async function registerAndLogin(appInstance) {
    const email = uniqueEmail();
    const password = 'TestPass@123';

    const regRes = await request(appInstance)
        .post('/v1/auth/register')
        .send({ name: 'WS Test User', email, password });

    const cookie = regRes.headers['set-cookie']
        .find((c) => c.startsWith('token='))
        .split(';')[0];

    // Get userId from /auth/me
    const meRes = await request(appInstance)
        .get('/v1/auth/me')
        .set('Cookie', cookie);

    return { cookie, userId: meRes.body.user.id, email };
}

// ── Tests ────────────────────────────────────────────────────────

describe('Real Integration 02 — Workspace → Collection → Request', () => {
    let cookie, userId;
    let workspaceId, collectionId, requestId;

    beforeAll(async () => {
        clearPrismaStore();
        const auth = await registerAndLogin(app);
        cookie = auth.cookie;
        userId = auth.userId;
    }, 30000);

    afterAll(() => clearPrismaStore());

    // ── 02.1: Create workspace ────────────────────────────────────
    test('02.1: POST /v1/workspaces/create — workspace + OWNER membership created', async () => {
        const res = await request(app)
            .post('/v1/workspaces/create')
            .set('Cookie', cookie)
            .send({ name: 'Integration Test Workspace', description: 'Created by integration test' });

        expect(res.status).toBe(201);
        expect(res.body.data).toBeDefined();
        expect(res.body.data.id).toBeTruthy();
        workspaceId = res.body.data.id;

        // Verify stateful DB: workspace exists with members
        const dbWs = await mockPrisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { members: true },
        });
        expect(dbWs).not.toBeNull();
        expect(dbWs.members).toHaveLength(1);
        expect(dbWs.members[0].role).toBe('OWNER');
    }, 15000);

    // ── 02.2: List workspaces ─────────────────────────────────────
    test('02.2: GET /v1/workspaces returns workspaces the user is member of', async () => {
        const res = await request(app)
            .get('/v1/workspaces')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        const found = res.body.data.find((w) => w.id === workspaceId);
        expect(found).toBeDefined();
        expect(found.name).toBe('Integration Test Workspace');
    });

    // ── 02.3: Create collection ───────────────────────────────────
    test('02.3: POST /v1/collections/workspace/:id — collection linked to workspace', async () => {
        const res = await request(app)
            .post(`/v1/collections/workspace/${workspaceId}`)
            .set('Cookie', cookie)
            .send({ name: 'Auth API Tests' });

        expect(res.status).toBe(201);
        expect(res.body.id).toBeTruthy();
        expect(res.body.name).toBe('Auth API Tests');
        collectionId = res.body.id;

        // Verify FK relationship
        const dbCol = await mockPrisma.collection.findUnique({ where: { id: collectionId } });
        expect(dbCol.workspaceId).toBe(workspaceId);
    });

    // ── 02.4: List collections ────────────────────────────────────
    test('02.4: GET /v1/collections/workspace/:id returns collections', async () => {
        const res = await request(app)
            .get(`/v1/collections/workspace/${workspaceId}`)
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.some((c) => c.id === collectionId)).toBe(true);
    });

    // ── 02.5: Create request under collection ─────────────────────
    test('02.5: POST /v1/requests/:collectionId — request linked to collection', async () => {
        const res = await request(app)
            .post(`/v1/requests/${collectionId}`)
            .set('Cookie', cookie)
            .send({
                name: 'Login Endpoint',
                protocol: 'http',
                config: {
                    method: 'POST',
                    url: 'https://api.example.com/auth/login',
                    headers: { 'Content-Type': 'application/json' },
                    body: { type: 'raw', raw: '{"email":"test@test.com"}' },
                },
            });

        expect(res.status).toBe(201);
        expect(res.body.id).toBeTruthy();
        requestId = res.body.id;

        // Verify FK chain: request → collection
        const dbReq = await mockPrisma.requestDefinition.findUnique({ where: { id: requestId } });
        expect(dbReq.collectionId).toBe(collectionId);
    });

    // ── 02.6: Workspace isolation ─────────────────────────────────
    test('02.6: Another user cannot see the workspace (membership filter)', async () => {
        const other = await registerAndLogin(app);

        const res = await request(app)
            .get('/v1/workspaces')
            .set('Cookie', other.cookie);

        expect(res.status).toBe(200);
        // Other user's workspace list should NOT contain ours
        const found = res.body.data.find((w) => w.id === workspaceId);
        expect(found).toBeUndefined();
    }, 15000);

    // ── 02.7: Soft-delete collection ──────────────────────────────
    test('02.7: DELETE /v1/collections/:id — soft-deleted and excluded from listings', async () => {
        // Create a disposable collection for deletion test
        const createRes = await request(app)
            .post(`/v1/collections/workspace/${workspaceId}`)
            .set('Cookie', cookie)
            .send({ name: 'To Be Deleted' });
        const deleteColId = createRes.body.id;

        const delRes = await request(app)
            .delete(`/v1/collections/${deleteColId}`)
            .set('Cookie', cookie);

        expect([200, 204]).toContain(delRes.status);

        // Verify soft-deleted in DB
        const dbCol = await mockPrisma.collection.findUnique({ where: { id: deleteColId } });
        expect(dbCol.deletedAt).not.toBeNull();

        // Excluded from GET listing
        const listRes = await request(app)
            .get(`/v1/collections/workspace/${workspaceId}`)
            .set('Cookie', cookie);
        expect(listRes.body.some((c) => c.id === deleteColId)).toBe(false);
    });
});
