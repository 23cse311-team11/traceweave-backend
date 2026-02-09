import httpStatus from 'http-status';
import { requestDefinitionService } from '../services/requestDefinition.service.js';
import catchAsync from '../utils/catchAsync.js';
import { executeHttpRequest } from '../services/http-runner.service.js';
import ExecutionLog from '../models/execution.model.js';
import prisma from '../config/prisma.js';
import { environmentService } from '../services/environment.service.js';
import { substituteVariables } from '../services/variableSubstitution.service.js';

export const requestController = {
    createRequest: catchAsync(async (req, res) => {
        const { collectionId } = req.params;
        const request = await requestDefinitionService.createRequest({
            ...req.body,
            collectionId
        });
        res.status(httpStatus.CREATED).send(request);
    }),

    getRequestsByCollection: catchAsync(async (req, res) => {
        const requests = await requestDefinitionService.getRequestsByCollection(
            req.params.collectionId
        );
        res.send(requests);
    }),

    updateRequest: catchAsync(async (req, res) => {
        const request = await requestDefinitionService.updateRequest(
            req.params.requestId,
            req.body,
            req.user.id
        );
        res.send(request);
    }),

    deleteRequest: catchAsync(async (req, res) => {
        await requestDefinitionService.softDeleteRequest(
            req.params.requestId,
            req.user.id
        );
        res.status(httpStatus.NO_CONTENT).send();
    }),

    sendRequest: catchAsync(async (req, res) => {
        try {
            const { requestId } = req.params;
            const userId = req.user.id;

            // More permissive ID check to avoid blocking valid IDs while still preventing junk
            if (!requestId || requestId.length < 5) {
                return res.status(400).json({ error: 'Invalid Request ID format' });
            }

            // If the user sends a POST without a body (or Content-Type issues), req.body is undefined.
            const { overrides = {}, environmentId } = req.body || {};

            // 2. Fetch Source of Truth
            const requestDef = await prisma.requestDefinition.findUnique({
                where: { id: requestId },
                include: { collection: true },
            }).catch(err => {
                // If Prisma specifically fails due to ID format, catch it here
                throw new Error(`Invalid ID lookup: ${err.message}`);
            });

            if (!requestDef) {
                return res.status(404).json({ error: 'Request definition not found' });
            }

            const workspaceId = requestDef.collection.workspaceId;

            // 3. Merge: Database Config + Overrides
            let config = {
                method: overrides.method ?? requestDef.method,
                url: overrides.url ?? requestDef.url,
                headers: overrides.headers ?? requestDef.headers ?? {},
                body: overrides.body ?? requestDef.body,
                params: overrides.params ?? requestDef.params ?? {},
            };

            // 4. Variable Substitution
            if (environmentId) {
                const variables = await environmentService.getVariablesForExecution(
                    environmentId,
                    userId,
                    workspaceId
                );
                config = substituteVariables(config, variables);
            }

            // 5. Execute
            const result = await executeHttpRequest(config);

            // 6. Log History
            const executionLog = await ExecutionLog.create({
                requestId: requestDef.id,
                collectionId: requestDef.collectionId,
                workspaceId: workspaceId,
                environmentId: environmentId || null,
                method: config.method,
                url: config.url,
                status: result.status,
                statusText: result.statusText,
                responseHeaders: result.headers,
                responseBody: result.data,
                responseSize: result.size,
                timings: result.timings,
                executedBy: userId,
            });

            res.status(200).json({
                ...result,
                time: result.timings.total,
                historyId: executionLog._id
            });

        } catch (error) {
            console.error('Execution Error:', error);
            const isPrismaError = error.message?.toLowerCase().includes('prisma');
            res.status(500).json({
                error: isPrismaError ? 'Internal database error during execution' : (error.message || 'Failed to execute request')
            });
        }
    }),

    /**
   * Path B: Execute Ad-Hoc Request (Scratchpad)
   * Route: POST /execute (No ID in URL)
   */
    executeAdHocRequest: catchAsync(async (req, res) => {
        try {
            const userId = req.user.id;
            // 1. We require workspaceId to enforce RBAC (Users can't just use our server as a free proxy)
            const { workspaceId, method, url, headers, body, params, environmentId } = req.body;

            if (!workspaceId || workspaceId.length < 5 || !url || !method) {
                return res.status(400).json({ error: 'Missing or invalid workspaceId, url, or method' });
            }

            const member = await prisma.workspaceMember.findUnique({
                where: {
                    workspaceId_userId: {
                        workspaceId,
                        userId
                    }
                }
            }).catch(err => {
                throw new Error(`Workspace member lookup failed: ${err.message}`);
            });

            // Only EDITOR or OWNER can execute.
            if (!member || (member.role !== 'EDITOR' && member.role !== 'OWNER')) {
                return res.status(403).json({ error: 'You do not have permission to execute requests in this workspace' });
            }

            // 2. Build Config directly from Body
            let config = { method, url, headers, body, params };

            // 3. Variable Substitution (if environmentId provided)
            if (environmentId) {
                const variables = await environmentService.getVariablesForExecution(
                    environmentId,
                    userId,
                    workspaceId
                );
                config = substituteVariables(config, variables);
            }

            // 4. Execute
            const result = await executeHttpRequest(config);

            // 5. Log History (Unlinked to any Request Definition)
            // We store workspaceId so it appears in the "Workspace History"
            const executionLog = await ExecutionLog.create({
                requestId: null, // Null indicates Ad-Hoc
                collectionId: null,
                workspaceId: workspaceId,
                environmentId: environmentId || null,
                method: config.method,
                url: config.url,
                status: result.status,
                statusText: result.statusText,
                responseHeaders: result.headers,
                responseBody: result.data,
                responseSize: result.size,
                timings: result.timings,
                executedBy: userId,
            });

            res.status(200).json({
                ...result,
                time: result.timings.total,
                historyId: executionLog._id
            });

        } catch (error) {
            console.error('Ad-Hoc Execution Error:', error);
            res.status(500).json({ error: error.message || 'Failed to execute request' });
        }
    }),

    getRequestHistory: catchAsync(async (req, res) => {
        try {
            const { requestId } = req.params;
            const { environmentId } = req.body;
            const history = await ExecutionLog.find({
                requestId,
                environmentId,
                executedBy: req.user.id
            })
                .sort({ createdAt: -1 })
                .limit(20);
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    }),
};