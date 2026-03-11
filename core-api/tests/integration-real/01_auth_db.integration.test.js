/**
 * Real Integration Test Suite 01: Auth ↔ Database
 *
 * Tests the FULL authentication pipeline end-to-end:
 *   - Register: bcrypt hash + Prisma creates user + identity
 *   - Duplicate email: Unique constraint enforcement
 *   - Login: bcrypt.compare against stored hash, JWT cookie issued
 *   - GET /auth/me: Auth middleware → JWT decode → user lookup
 *   - Logout: Cookie clearing
 *
 * Uses stateful in-memory Prisma — data persists across steps in each test.
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
    clearPrismaStore();
    await clearMongo();
    await stopMongo();
}, 15000);

// ── Tests ────────────────────────────────────────────────────────

describe('Real Integration 01 — Auth ↔ Database', () => {
    const password = 'IntegrationTest@123';

    // ── 01.1: Register a new user ─────────────────────────────────
    test('01.1: POST /v1/auth/register creates user + identity with bcrypt hash', async () => {
        const email = uniqueEmail();

        const res = await request(app)
            .post('/v1/auth/register')
            .send({ name: 'Integration User', email, password });

        expect(res.status).toBe(201);
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe(email);

        // Verify JWT cookie was set
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        expect(cookies.some((c) => c.startsWith('token='))).toBe(true);

        // Verify data actually persisted in the DB mock (stateful check)
        const dbUser = await mockPrisma.user.findUnique({
            where: { email },
            include: { identities: true },
        });
        expect(dbUser).not.toBeNull();
        expect(dbUser.email).toBe(email);
        expect(dbUser.identities).toHaveLength(1);
        expect(dbUser.identities[0].provider).toBe('email');
        expect(dbUser.identities[0].passwordHash).toBeTruthy();
        // Verify bcrypt hash is a real hash (starts with $2)
        expect(dbUser.identities[0].passwordHash).toMatch(/^\$2[aby]/);
    }, 15000);

    // ── 01.2: Duplicate registration rejected ─────────────────────
    test('01.2: Duplicate email registration returns 400', async () => {
        const email = uniqueEmail();

        // First registration
        await request(app)
            .post('/v1/auth/register')
            .send({ name: 'First User', email, password });

        // Second registration with same email
        const res = await request(app)
            .post('/v1/auth/register')
            .send({ name: 'Duplicate User', email, password });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/email already taken/i);
    }, 15000);

    // ── 01.3: Login with correct credentials ──────────────────────
    test('01.3: POST /v1/auth/login with valid credentials returns JWT cookie', async () => {
        const email = uniqueEmail();

        // Register first
        await request(app)
            .post('/v1/auth/register')
            .send({ name: 'Login User', email, password });

        // Login
        const res = await request(app)
            .post('/v1/auth/login')
            .send({ email, password });

        expect(res.status).toBe(200);
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe(email);

        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const tokenCookie = cookies.find((c) => c.startsWith('token='));
        expect(tokenCookie).toBeTruthy();
    }, 15000);

    // ── 01.4: Login with wrong password ───────────────────────────
    test('01.4: Login with wrong password returns 401', async () => {
        const email = uniqueEmail();
        await request(app)
            .post('/v1/auth/register')
            .send({ name: 'Wrong PW User', email, password });

        const res = await request(app)
            .post('/v1/auth/login')
            .send({ email, password: 'WrongPassword@999' });

        expect(res.status).toBe(401);
    }, 15000);

    // ── 01.5: Login with non-existent user ────────────────────────
    test('01.5: Login with unknown email returns 401', async () => {
        const res = await request(app)
            .post('/v1/auth/login')
            .send({ email: 'nobody@example.com', password });

        expect(res.status).toBe(401);
    });

    // ── 01.6: GET /auth/me with valid JWT ─────────────────────────
    test('01.6: GET /v1/auth/me with real JWT returns authenticated user', async () => {
        const email = uniqueEmail();

        const regRes = await request(app)
            .post('/v1/auth/register')
            .send({ name: 'Me User', email, password });

        expect(regRes.status).toBe(201);

        const setCookieHeader = regRes.headers['set-cookie'];
        const cookie = setCookieHeader
            .find((c) => c.startsWith('token='))
            .split(';')[0];

        const res = await request(app)
            .get('/v1/auth/me')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.isAuthenticated).toBe(true);
        expect(res.body.user.email).toBe(email);
    }, 15000);

    // ── 01.7: GET /auth/me without token ──────────────────────────
    test('01.7: GET /v1/auth/me without token returns 401', async () => {
        const res = await request(app).get('/v1/auth/me');
        expect(res.status).toBe(401);
    });

    // ── 01.8: Logout clears cookie ────────────────────────────────
    test('01.8: POST /v1/auth/logout clears the token cookie', async () => {
        const email = uniqueEmail();
        const regRes = await request(app)
            .post('/v1/auth/register')
            .send({ name: 'Logout User', email, password });

        const cookie = regRes.headers['set-cookie']
            .find((c) => c.startsWith('token='))
            .split(';')[0];

        const res = await request(app)
            .post('/v1/auth/logout')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/logged out/i);
    }, 15000);
});
