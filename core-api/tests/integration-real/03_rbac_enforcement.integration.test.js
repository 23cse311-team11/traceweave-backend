/**
 * Real Integration Test Suite 03: RBAC Cross-Module Enforcement
 *
 * Tests RBAC middleware with REAL stateful DB state:
 *   - OWNER full access
 *   - VIEWER blocked from writes (403)
 *   - Non-member blocked (404)
 *   - Expired JWT blocked at auth layer (401)
 *   - Soft-deleted workspace blocks all access
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import {
    buildApp,
    startMongo,
    stopMongo,
    clearMongo,
    uniqueEmail,
    makeExpiredCookie,
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

// ── Helper: register + login ─────────────────────────────────────
async function registerUser(appInstance) {
    const email = uniqueEmail();
    const password = 'TestPass@123';

    const regRes = await request(appInstance)
        .post('/v1/auth/register')
        .send({ name: 'RBAC Test User', email, password });

    const cookie = regRes.headers['set-cookie']
        .find((c) => c.startsWith('token='))
        .split(';')[0];

    const meRes = await request(appInstance)
        .get('/v1/auth/me')
        .set('Cookie', cookie);

    return { cookie, userId: meRes.body.user.id, email };
}

// ── Tests ────────────────────────────────────────────────────────

describe('Real Integration 03 — RBAC Cross-Module Enforcement', () => {
    let owner, viewer;
    let workspaceId, collectionId;

    beforeAll(async () => {
        clearPrismaStore();

        // Register owner and create workspace
        owner = await registerUser(app);

        const wsRes = await request(app)
            .post('/v1/workspaces/create')
            .set('Cookie', owner.cookie)
            .send({ name: 'RBAC Test Workspace' });
        workspaceId = wsRes.body.data.id;

        // Register viewer user
        viewer = await registerUser(app);

        // Add viewer as VIEWER member directly in the stateful DB
        await mockPrisma.workspaceMember.create({
            data: {
                workspaceId,
                userId: viewer.userId,
                role: 'VIEWER',
            },
        });

        // Create a collection for testing
        const colRes = await request(app)
            .post(`/v1/collections/workspace/${workspaceId}`)
            .set('Cookie', owner.cookie)
            .send({ name: 'RBAC Test Collection' });
        collectionId = colRes.body.id;
    }, 30000);

    afterAll(() => clearPrismaStore());

    // ── 03.1: OWNER can create collections ────────────────────────
    test('03.1: OWNER can create collections (full middleware chain)', async () => {
        const res = await request(app)
            .post(`/v1/collections/workspace/${workspaceId}`)
            .set('Cookie', owner.cookie)
            .send({ name: 'Owner Created Collection' });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Owner Created Collection');
    });

    // ── 03.2: VIEWER cannot create collections ────────────────────
    test('03.2: VIEWER cannot create collections (403 from RBAC)', async () => {
        const res = await request(app)
            .post(`/v1/collections/workspace/${workspaceId}`)
            .set('Cookie', viewer.cookie)
            .send({ name: 'Viewer Attempt' });

        expect(res.status).toBe(403);
    });

    // ── 03.3: VIEWER can read collections ─────────────────────────
    test('03.3: VIEWER can list collections (read access)', async () => {
        const res = await request(app)
            .get(`/v1/collections/workspace/${workspaceId}`)
            .set('Cookie', viewer.cookie);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    // ── 03.4: Non-member blocked ──────────────────────────────────
    test('03.4: Non-member user gets 404/403 on workspace collections', async () => {
        const outsider = await registerUser(app);
        const res = await request(app)
            .get(`/v1/collections/workspace/${workspaceId}`)
            .set('Cookie', outsider.cookie);

        expect([403, 404]).toContain(res.status);
    }, 15000);

    // ── 03.5: Expired JWT blocked ─────────────────────────────────
    test('03.5: Expired JWT returns 401 before RBAC layer', async () => {
        const expiredCookie = makeExpiredCookie();
        const res = await request(app)
            .get(`/v1/collections/workspace/${workspaceId}`)
            .set('Cookie', expiredCookie);

        expect(res.status).toBe(401);
    });

    // ── 03.6: Soft-deleted workspace blocks access ────────────────
    test('03.6: Soft-deleted workspace blocks all access through RBAC', async () => {
        // Create a temp workspace, then soft-delete it
        const tempWsRes = await request(app)
            .post('/v1/workspaces/create')
            .set('Cookie', owner.cookie)
            .send({ name: 'Temp For Deletion' });
        const tempWsId = tempWsRes.body.data.id;

        // Soft-delete directly in DB
        await mockPrisma.workspace.update({
            where: { id: tempWsId },
            data: { deletedAt: new Date() },
        });

        const res = await request(app)
            .get(`/v1/collections/workspace/${tempWsId}`)
            .set('Cookie', owner.cookie);

        expect([403, 404]).toContain(res.status);
    });

    // ── 03.7: OWNER can create requests ───────────────────────────
    test('03.7: OWNER can create requests under collections', async () => {
        const res = await request(app)
            .post(`/v1/requests/${collectionId}`)
            .set('Cookie', owner.cookie)
            .send({ name: 'RBAC Chain Test', config: { method: 'GET', url: 'https://example.com' } });

        expect(res.status).toBe(201);
    });
});
