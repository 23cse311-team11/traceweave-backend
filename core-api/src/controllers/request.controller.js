import httpStatus from 'http-status';
import { requestDefinitionService } from '../services/requestDefinition.service.js';
import catchAsync from '../utils/catchAsync.js';
import { executeHttpRequest } from '../services/http-runner.service.js';
import ExecutionLog from '../models/execution.model.js';

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
        // Updated service might not strictly require userId for read yet if we didn't enforce it there,
        // but let's pass it for consistency or future use.
        // Actually I didn't add userId param to getRequestsByCollection in service, so I'll leave it.
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
        
        // 1. Get Runtime Overrides (Draft Mode)
        // overrides = { url: "...", body: ... } (Unsaved changes from frontend)
        const { overrides = {}, variables = {} } = req.body;

        // 2. Fetch Source of Truth
        const requestDef = await prisma.requestDefinition.findUnique({
            where: { id: requestId },
            include: { collection: true },
        });

        if (!requestDef) {
            return res.status(404).json({ error: 'Request definition not found' });
        }

        // 3. Merge: Database Config + Overrides
        let config = {
            method: overrides.method || requestDef.method,
            url: overrides.url || requestDef.url,
            headers: overrides.headers || requestDef.headers,
            body: overrides.body || requestDef.body,
            params: overrides.params || requestDef.params,
        };

        // 4. (Future) Variable Substitution
        // config = substituteVariables(config, variables);

        // 5. Execute
        const result = await executeHttpRequest(config);

        // 6. Log History (Linked to Request ID)
        const executionLog = await ExecutionLog.create({
            requestId: requestDef.id,
            collectionId: requestDef.collectionId,
            workspaceId: requestDef.collection.workspaceId,
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

        res.status(200).json({ ...result, historyId: executionLog._id });

        } catch (error) {
        console.error('Execution Error:', error);
        res.status(500).json({ error: 'Failed to execute request' });
        }
    }),

    getRequestHistory: catchAsync(async (req, res) => {
        try {
            const { requestId } = req.params;
            const history = await ExecutionLog.find({ requestId })
                .sort({ createdAt: -1 })
                .limit(20);
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    }),
};
