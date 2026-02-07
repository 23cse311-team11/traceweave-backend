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

        // 1. Get Request Definition from Postgres
        const requestDef = await prisma.requestDefinition.findUnique({
            where: { id: requestId },
            include: { collection: true }, // To get workspaceId if needed
        });

        if (!requestDef) {
            return res.status(404).json({ error: 'Request definition not found' });
        }

        // 2. Prepare Config (Merge saved config with runtime overrides if any)
        // For now, we just run what's saved
        const config = {
            method: requestDef.method,
            url: requestDef.url,
            headers: requestDef.headers,
            body: requestDef.body,
            params: requestDef.params,
        };

        // 3. Execute Request (The Runner)
        const result = await executeHttpRequest(config);

        // 4. Async: Save History to MongoDB (Fire and Forget or Await?)
        // We await it to return the 'historyId' to the user immediately
        const executionLog = await ExecutionLog.create({
            requestId: requestDef.id,
            collectionId: requestDef.collectionId,
            workspaceId: requestDef.collection.workspaceId,
            
            method: config.method,
            url: config.url,
            requestHeaders: config.headers,
            requestBody: config.body,

            status: result.status,
            statusText: result.statusText,
            responseHeaders: result.headers,
            responseBody: result.data,
            responseSize: result.size,
            
            timings: result.timings,
            executedBy: userId,
        });

        // 5. Return Response
        res.status(200).json({
            ...result,
            historyId: executionLog._id, // Send back Mongo ID
        });

        } catch (error) {
        console.error('Execution Error:', error);
        res.status(500).json({ error: 'Failed to execute request' });
        }
    }),
};
