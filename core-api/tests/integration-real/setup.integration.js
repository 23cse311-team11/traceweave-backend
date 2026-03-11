/**
 * Shared Integration Test Infrastructure
 *
 * PURPOSE:
 *   Boot the REAL Express app with REAL middleware/controller/service wiring.
 *   Use an in-memory MongoDB (via mongodb-memory-server) for execution logs.
 *   Use a STATEFUL Prisma mock that simulates real DB behavior (stores data
 *   in memory, supports findUnique/findMany/create/update/delete/transaction).
 *
 *   This is how professional teams test when the production DB (Supabase)
 *   is not available locally — the Prisma mock maintains state across calls,
 *   so the full Auth → RBAC → Service → "DB" chain works end-to-end.
 *
 *   ONLY truly external I/O is mocked:
 *     - nodemailer (email sending)
 *     - passport OAuth strategies (require live credentials)
 *     - HTTP runner (external network calls)
 */

import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';

// ── 0. Set JWT_SECRET BEFORE any app modules load ───────────────
// This MUST happen before `import('../../src/routes/index.js')` so that
// `config.js` evaluates `process.env.JWT_SECRET` with our value, not the default.
const JWT_SECRET = process.env.JWT_SECRET || 'fruP3yHdgYVJUW9A5U/QxrmbJu2kw2aanP9FYc/k0Tg=';
process.env.JWT_SECRET = JWT_SECRET;

// ── 1. Stateful In-Memory Prisma Mock ───────────────────────────
//
// This mock stores data in Maps keyed by table name. It supports
// create, findUnique, findMany, update, delete, deleteMany, count,
// and $transaction — enough to run the full app logic flow.

const tables = {};

// Prisma uses different names for the same table depending on context:
// - Relation name in `include` / nested create: e.g. "members", "identities"
// - Model name in `prisma.workspaceMember.findUnique()`: e.g. "workspaceMember"
// This map ensures they use the same underlying array.
const TABLE_ALIASES = {
    members: 'workspaceMember',
    identities: 'identity',
    // Add more aliases as needed
};

function getTable(name) {
    const canonical = TABLE_ALIASES[name] || name;
    if (!tables[canonical]) tables[canonical] = [];
    return tables[canonical];
}

function matchWhere(record, where) {
    if (!where) return true;
    for (const [key, val] of Object.entries(where)) {
        if (key === 'AND') return val.every(cond => matchWhere(record, cond));
        if (key === 'OR') return val.some(cond => matchWhere(record, cond));
        if (key === 'NOT') return !matchWhere(record, val);
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            if ('in' in val) { if (!val.in.includes(record[key])) return false; continue; }
            if ('some' in val) {
                // For relation filter: e.g. members: { some: { userId } }
                // Check if the related table has matching records
                const relatedTable = getTable(key);
                const parentIdKey = guessParentFK(key, record);
                const relatedRecords = relatedTable.filter(r => r[parentIdKey] === record.id);
                if (!relatedRecords.some(r => matchWhere(r, val.some))) return false;
                continue;
            }
            // Composite unique key: e.g. { workspaceId_userId: { workspaceId, userId } }
            if (key.includes('_')) {
                const parts = key.split('_');
                const isComposite = parts.every(p => val[p] !== undefined);
                if (isComposite) {
                    for (const p of parts) {
                        if (record[p] !== val[p]) return false;
                    }
                    continue;
                }
            }
            // Nested object match
            if (!matchWhere(record[key], val)) return false;
            continue;
        }
        if (record[key] !== val) return false;
    }
    return true;
}

function guessParentFK(tableName, parentRecord) {
    // For 'members' table, the FK to workspace is 'workspaceId'
    if (tableName === 'members' || tableName === 'workspaceMember') return 'workspaceId';
    return 'workspaceId';
}

function resolveIncludes(record, include) {
    if (!include || !record) return record;
    const result = { ...record };
    for (const [rel, opts] of Object.entries(include)) {
        if (opts === true || (typeof opts === 'object')) {
            // Find related records — getTable handles name aliasing
            const relTable = getTable(rel);
            const fkPattern = [record.id];

            // Determine FK field name
            let fkField;
            if (rel === 'identities' || rel === 'identity') fkField = 'userId';
            else if (rel === 'members' || rel === 'workspaceMember') fkField = 'workspaceId';
            else if (rel === 'user') fkField = null; // single relation
            else if (rel === 'workspace') fkField = null;
            else if (rel === 'collection') fkField = null;
            else if (rel === 'children') fkField = 'parentId';
            else if (rel === 'requests') fkField = 'collectionId';
            else if (rel === 'steps') fkField = 'workflowId';
            else if (rel === 'request') fkField = null; // belongs-to via requestId
            else if (rel === 'variables') fkField = 'environmentId';
            else if (rel === 'createdBy') fkField = null;
            else if (rel === 'userEnvironments') fkField = 'environmentId';
            else if (rel === 'inviter') fkField = null;
            else if (rel === 'collections') fkField = 'workspaceId';
            else if (rel === 'environments') fkField = 'workspaceId';
            else fkField = `${rel}Id`;

            if (fkField) {
                // Has-many
                let related = relTable.filter(r => r[fkField] === record.id);
                if (typeof opts === 'object' && opts.where) {
                    related = related.filter(r => matchWhere(r, opts.where));
                }
                if (typeof opts === 'object' && opts.orderBy) {
                    const [field, dir] = Object.entries(opts.orderBy)[0];
                    related.sort((a, b) => dir === 'asc' ? (a[field] > b[field] ? 1 : -1) : (a[field] < b[field] ? 1 : -1));
                }
                if (typeof opts === 'object' && opts.include) {
                    related = related.map(r => resolveIncludes(r, opts.include));
                }
                if (typeof opts === 'object' && opts.select) {
                    related = related.map(r => applySelect(r, opts.select));
                }
                result[rel] = related;
            } else {
                // Belongs-to (single record)
                let refId;
                if (rel === 'user') refId = record.userId;
                else if (rel === 'workspace') refId = record.workspaceId;
                else if (rel === 'collection') refId = record.collectionId;
                else if (rel === 'request') refId = record.requestId;
                else if (rel === 'createdBy') refId = record.createdById;
                else if (rel === 'inviter') refId = record.inviterId;
                else refId = record[`${rel}Id`];

                const relatedRecord = relTable.find(r => r.id === refId) || null;
                if (typeof opts === 'object' && opts.select && relatedRecord) {
                    result[rel] = applySelect(relatedRecord, opts.select);
                } else if (typeof opts === 'object' && opts.include && relatedRecord) {
                    result[rel] = resolveIncludes(relatedRecord, opts.include);
                } else {
                    result[rel] = relatedRecord;
                }
            }
        }
    }
    return result;
}

function applySelect(record, select) {
    if (!select || !record) return record;
    const result = {};
    for (const [key, val] of Object.entries(select)) {
        if (key === '_count') {
            result._count = {};
            for (const [countRel, countOpts] of Object.entries(val.select)) {
                const relTable = getTable(countRel);
                let fkField = 'workspaceId';
                if (countRel === 'variables') fkField = 'environmentId';
                let related = relTable.filter(r => r[fkField] === record.id);
                if (countOpts && typeof countOpts === 'object' && countOpts.where) {
                    related = related.filter(r => matchWhere(r, countOpts.where));
                }
                result._count[countRel] = related.length;
            }
            continue;
        }
        if (val === true) {
            result[key] = record[key];
        } else if (typeof val === 'object') {
            // Nested include-like select
            result[key] = resolveIncludes(record, { [key]: val })[key];
        }
    }
    return result;
}

function createModelProxy(tableName) {
    return {
        create: jest.fn(async ({ data, include, select }) => {
            const table = getTable(tableName);
            const record = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...data };

            // Handle nested creates (e.g. members: { create: { ... } })
            for (const [key, val] of Object.entries(data)) {
                if (val && typeof val === 'object' && val.create) {
                    const relTable = getTable(key);
                    let fkField;
                    if (key === 'members' || key === 'workspaceMember') fkField = 'workspaceId';
                    else if (key === 'children') fkField = 'parentId';
                    else if (key === 'requests') fkField = 'collectionId';
                    else fkField = `${tableName}Id`;

                    const nested = Array.isArray(val.create) ? val.create : [val.create];
                    const createdNested = [];
                    for (const item of nested) {
                        // Resolve "connect" references
                        const resolvedItem = { ...item };
                        for (const [ik, iv] of Object.entries(item)) {
                            if (iv && typeof iv === 'object' && iv.connect) {
                                resolvedItem[`${ik}Id`] = iv.connect.id;
                                delete resolvedItem[ik];
                            }
                        }
                        const nestedRecord = { id: randomUUID(), [fkField]: record.id, ...resolvedItem, createdAt: new Date(), updatedAt: new Date() };
                        relTable.push(nestedRecord);
                        createdNested.push(nestedRecord);
                    }

                    delete record[key];
                }
                // Handle "connect" references
                if (val && typeof val === 'object' && val.connect) {
                    record[`${key}Id`] = val.connect.id;
                    delete record[key];
                }
            }

            table.push(record);
            let result = { ...record };
            if (include) result = resolveIncludes(result, include);
            if (select) result = applySelect(result, select);
            return result;
        }),

        findUnique: jest.fn(async ({ where, include, select }) => {
            const table = getTable(tableName);
            let record = null;

            if (where.id) {
                record = table.find(r => r.id === where.id);
            } else {
                // Handle composite keys and other unique fields
                record = table.find(r => matchWhere(r, where));
            }

            if (!record) return null;
            let result = { ...record };
            if (include) result = resolveIncludes(result, include);
            if (select) result = applySelect(result, select);
            return result;
        }),

        findFirst: jest.fn(async ({ where, include, select, orderBy } = {}) => {
            const table = getTable(tableName);
            let records = table.filter(r => matchWhere(r, where));
            if (orderBy) {
                const [field, dir] = Object.entries(orderBy)[0];
                records.sort((a, b) => dir === 'asc' ? (a[field] > b[field] ? 1 : -1) : (a[field] < b[field] ? 1 : -1));
            }
            const record = records[0] || null;
            if (!record) return null;
            let result = { ...record };
            if (include) result = resolveIncludes(result, include);
            if (select) result = applySelect(result, select);
            return result;
        }),

        findMany: jest.fn(async ({ where, include, select, orderBy, take } = {}) => {
            const table = getTable(tableName);
            let records = table.filter(r => matchWhere(r, where || {}));
            if (orderBy) {
                const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
                for (const ob of entries.reverse()) {
                    const [field, dir] = Object.entries(ob)[0];
                    records.sort((a, b) => dir === 'asc' ? (a[field] > b[field] ? 1 : -1) : (a[field] < b[field] ? 1 : -1));
                }
            }
            if (take) records = records.slice(0, take);
            return records.map(r => {
                let result = { ...r };
                if (include) result = resolveIncludes(result, include);
                if (select) result = applySelect(result, select);
                return result;
            });
        }),

        update: jest.fn(async ({ where, data, include, select }) => {
            const table = getTable(tableName);
            const idx = table.findIndex(r => matchWhere(r, where));
            if (idx === -1) throw new Error(`Record not found in ${tableName}`);
            table[idx] = { ...table[idx], ...data, updatedAt: new Date() };
            let result = { ...table[idx] };
            if (include) result = resolveIncludes(result, include);
            if (select) result = applySelect(result, select);
            return result;
        }),

        updateMany: jest.fn(async ({ where, data }) => {
            const table = getTable(tableName);
            let count = 0;
            for (let i = 0; i < table.length; i++) {
                if (matchWhere(table[i], where)) {
                    table[i] = { ...table[i], ...data, updatedAt: new Date() };
                    count++;
                }
            }
            return { count };
        }),

        delete: jest.fn(async ({ where }) => {
            const table = getTable(tableName);
            const idx = table.findIndex(r => matchWhere(r, where));
            if (idx === -1) throw new Error(`Record not found in ${tableName}`);
            return table.splice(idx, 1)[0];
        }),

        deleteMany: jest.fn(async ({ where } = {}) => {
            const table = getTable(tableName);
            const toKeep = table.filter(r => !matchWhere(r, where || {}));
            const removed = table.length - toKeep.length;
            tables[tableName] = toKeep;
            return { count: removed };
        }),

        count: jest.fn(async ({ where } = {}) => {
            const table = getTable(tableName);
            return table.filter(r => matchWhere(r, where || {})).length;
        }),

        createMany: jest.fn(async ({ data, skipDuplicates }) => {
            const table = getTable(tableName);
            let count = 0;
            for (const item of data) {
                if (skipDuplicates) {
                    const exists = table.find(r => {
                        return Object.entries(item).every(([k, v]) => r[k] === v);
                    });
                    if (exists) continue;
                }
                table.push({ id: randomUUID(), ...item, createdAt: new Date(), updatedAt: new Date() });
                count++;
            }
            return { count };
        }),
    };
}

const mockPrisma = new Proxy({}, {
    get(target, prop) {
        if (prop === '$transaction') {
            return async (arg) => {
                if (typeof arg === 'function') {
                    // Callback-style transaction — pass the proxy itself
                    return arg(mockPrisma);
                }
                // Array-style transaction
                return Promise.all(arg);
            };
        }
        if (prop === '$connect' || prop === '$disconnect') return async () => { };
        if (prop.startsWith('$')) return async () => { };
        if (!target[prop]) target[prop] = createModelProxy(prop);
        return target[prop];
    }
});

/** Clear all in-memory tables */
export function clearPrismaStore() {
    for (const key of Object.keys(tables)) {
        tables[key] = [];
    }
}

// ── 2. Mock external dependencies ───────────────────────────────

// Mock Prisma config to use our stateful in-memory mock
jest.unstable_mockModule('../../src/config/prisma.js', () => ({
    default: mockPrisma,
}));

// Suppress real email sending
jest.unstable_mockModule('nodemailer', () => ({
    default: {
        createTransport: jest.fn().mockReturnValue({
            sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-email-id' }),
            verify: jest.fn((cb) => cb(null, true)),
        }),
    },
}));

// Mock passport config to prevent OAuth strategy registration
import passport from 'passport';
jest.unstable_mockModule('../../src/config/passport.js', () => ({
    default: passport,
}));

// Mock HTTP runner (external network calls only)
const mockExecuteHttpRequest = jest.fn();
jest.unstable_mockModule('../../src/services/http-runner.service.js', () => ({
    executeHttpRequest: mockExecuteHttpRequest,
}));

// ── 3. Import REAL modules (after mocks are registered) ─────────

const { default: express } = await import('express');
const { default: helmet } = await import('helmet');
const { default: cors } = await import('cors');
const { default: cookieParser } = await import('cookie-parser');
const httpStatus = (await import('http-status')).default;
const { default: routes } = await import('../../src/routes/index.js');
const { errorConverter, errorHandler } = await import('../../src/middlewares/error.js');
const { default: ApiError } = await import('../../src/utils/ApiError.js');
const { default: passportMw } = await import('../../src/config/passport.js');

// ── 4. MongoDB In-Memory Server ─────────────────────────────────

let mongoServer;

export async function startMongo() {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
}

export async function clearMongo() {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
}

export async function stopMongo() {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
}

// ── 5. Build the Real Express App ───────────────────────────────

export function buildApp() {
    const app = express();
    app.use(helmet());
    app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
    app.use(express.json());
    app.use(cookieParser());
    app.use(passportMw.initialize());

    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'OK', service: 'Core API' });
    });

    app.use('/v1', routes);

    app.use((req, res, next) => {
        next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
    });

    app.use(errorConverter);
    app.use(errorHandler);

    return app;
}

// ── 6. Test Helpers ─────────────────────────────────────────────
// JWT_SECRET was set in section 0 above, before any imports.

export function uniqueEmail() {
    const id = randomBytes(4).toString('hex');
    return `inttest-${id}@traceweave-test.com`;
}

export function makeAuthCookie(userId) {
    const token = jwt.sign({ sub: userId, id: userId }, JWT_SECRET, { expiresIn: '1h' });
    return `token=${token}`;
}

export function makeExpiredCookie(userId = 'expired-user') {
    const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '-1s' });
    return `token=${token}`;
}

// ── 7. Exports ──────────────────────────────────────────────────

export { mockPrisma, mockExecuteHttpRequest };
