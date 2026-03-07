import httpStatus from 'http-status';
import { requestDefinitionService } from '../services/requestDefinition.service.js';
import catchAsync from '../utils/catchAsync.js';
import { executeHttpRequest } from '../services/http-runner.service.js';
import { executeGraphQLRequest } from '../services/graphql-runner.service.js';
import ExecutionLog from '../models/execution.model.js';
import prisma from '../config/prisma.js';
import { environmentService } from '../services/environment.service.js';
import { substituteVariables } from '../services/variableSubstitution.service.js';
import { loadCookieJar, persistCookieJar } from '../services/cookie.service.js';

export const requestController = {

  /* ===========================
     CRUD
  ============================ */

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

  /* ===========================
     EXECUTE SAVED REQUEST
  ============================ */

    sendRequest: catchAsync(async (req, res) => {
      try {
        const { requestId } = req.params;
        const userId = req.user.id;

        if (!requestId || requestId.length < 5) return res.status(400).json({ error: 'Invalid Request ID format' });

        let overrides = {};
        if (req.body.overrides) overrides = typeof req.body.overrides === 'string' ? JSON.parse(req.body.overrides) : req.body.overrides;
        const environmentId = req.body.environmentId;

        const requestDef = await prisma.requestDefinition.findUnique({
          where: { id: requestId },
          include: { collection: true },
        });

        if (!requestDef) return res.status(404).json({ error: 'Request not found' });

        const workspaceId = requestDef.collection.workspaceId;
        const dbConfig = requestDef.config || {};
        let overrideConfig = overrides.config || {};

        let config = {
          method: overrideConfig.method ?? dbConfig.method ?? 'GET',
          url: overrideConfig.url ?? dbConfig.url ?? '',
          headers: { ...(dbConfig.headers || {}), ...(overrideConfig.headers || {}) },
          params: { ...(dbConfig.params || {}), ...(overrideConfig.params || {}) },
          body: overrideConfig.body ?? dbConfig.body,
        };

        // 1. RUN VARIABLE SUBSTITUTION FIRST
        if (environmentId) {
          const variables = await environmentService.getVariablesForExecution(environmentId, userId, workspaceId);
          config = substituteVariables(config, variables);
        }

        // 2. MAP NATIVE FILES SECOND (So they don't get destroyed)
        if (req.files && req.files.length > 0) {
            if (config.body?.type === 'binary') {
                config.body.binaryFile = {
                    buffer: req.files.find(f => f.fieldname === 'binary_upload')?.buffer || req.files[0].buffer,
                    name: req.files[0].originalname,
                    type: req.files[0].mimetype
                };
            }
            if (config.body?.type === 'formdata') {
                config.body.formdata = config.body.formdata.map(item => {
                    if (item.isFile) {
                        const uploadedFile = req.files.find(f => f.fieldname === item.key);
                        if (uploadedFile) item.value = { buffer: uploadedFile.buffer, name: uploadedFile.originalname, type: uploadedFile.mimetype };
                    }
                    return item;
                });
            }
        }

        const domain = new URL(config.url).hostname;
        const jar = await loadCookieJar(userId, workspaceId, domain);

        let result;
        if (requestDef.protocol === 'graphql') result = await executeGraphQLRequest({ ...config, url: config.url }, jar);
        else result = await executeHttpRequest(config, jar);

        if (result.headers?.['set-cookie']) await persistCookieJar(jar, userId, workspaceId, config.url);

        const executionLog = await ExecutionLog.create({
          requestId: requestDef.id, collectionId: requestDef.collectionId, workspaceId,
          environmentId: environmentId || null, method: config.method, url: config.url,
          status: result.status, statusText: result.statusText, responseHeaders: result.headers,
          responseBody: result.data, responseSize: result.size, timings: result.timings, executedBy: userId,
        });

        res.status(200).json({ ...result, time: result.timings.total, historyId: executionLog._id });
      } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to execute request' });
      }
    }),

  /**
   * Path B: Execute Ad-Hoc Request (Scratchpad)
   */
  executeAdHocRequest: catchAsync(async (req, res) => {
    try {
      const userId = req.user.id;
      const workspaceId = req.body.workspaceId;
      const protocol = req.body.protocol || 'http';
      const environmentId = req.body.environmentId;

      let config = {};
      if (req.body.config) config = typeof req.body.config === 'string' ? JSON.parse(req.body.config) : req.body.config;

      const { method = 'GET', url, headers = {}, body, params = {} } = config;

      if (!workspaceId || workspaceId.length < 5 || !url) return res.status(400).json({ error: 'Missing workspaceId or url' });

      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
      });

      if (!member || (member.role !== 'EDITOR' && member.role !== 'OWNER')) return res.status(403).json({ error: 'Permission denied' });

      let execConfig = { method, url, headers, body, params };

      // 1. RUN VARIABLE SUBSTITUTION FIRST
      if (environmentId) {
        const variables = await environmentService.getVariablesForExecution(environmentId, userId, workspaceId);
        execConfig = substituteVariables(execConfig, variables);
      }

      // 2. MAP NATIVE FILES SECOND (So they don't get destroyed)
      if (req.files && req.files.length > 0) {
          if (execConfig.body?.type === 'binary') {
              execConfig.body.binaryFile = {
                  buffer: req.files.find(f => f.fieldname === 'binary_upload')?.buffer || req.files[0].buffer,
                  name: req.files[0].originalname,
                  type: req.files[0].mimetype
              };
          }
          if (execConfig.body?.type === 'formdata') {
              execConfig.body.formdata = execConfig.body.formdata.map(item => {
                  if (item.isFile) {
                      const uploadedFile = req.files.find(f => f.fieldname === item.key);
                      if (uploadedFile) item.value = { buffer: uploadedFile.buffer, name: uploadedFile.originalname, type: uploadedFile.mimetype };
                  }
                  return item;
              });
          }
      }

      let jar = null;
      try {
        const urlObj = new URL(execConfig.url.includes('://') ? execConfig.url : `http://${execConfig.url}`);
        jar = await loadCookieJar(userId, workspaceId, urlObj.hostname);
      } catch (e) {}

      let result;
      if (protocol === 'graphql') result = await executeGraphQLRequest(execConfig, jar);
      else result = await executeHttpRequest(execConfig, jar);

      if (result.headers?.['set-cookie']) await persistCookieJar(jar, userId, workspaceId, execConfig.url);

      const executionLog = await ExecutionLog.create({
        requestId: null, collectionId: null, workspaceId,
        environmentId: environmentId || null, method: execConfig.method, url: execConfig.url,
        status: result.status, statusText: result.statusText, responseHeaders: result.headers,
        responseBody: result.data, responseSize: result.size, timings: result.timings, executedBy: userId,
      });

      res.status(200).json({ ...result, time: result.timings.total, historyId: executionLog._id });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to execute request' });
    }
  }),

    /* ===========================
     HISTORY
    ============================ */
    getRequestHistory: catchAsync(async (req, res) => {
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
    }),

    /**
   * Path C: Sync Local Desktop Execution (OP-363)
   * This is a lightweight, fire-and-forget endpoint to log executions
   * that happened locally inside the Electron app.
   */
  syncExecutionHistory: catchAsync(async (req, res) => {
    try {
      const { requestId, workspaceId, protocol, url, method, responseMeta } = req.body;
      const userId = req.user.id;

      if (!workspaceId) {
        return res.status(400).json({ error: 'workspaceId is required for history sync' });
      }

      // If it's a saved request, fetch the collectionId from Postgres to maintain relationships
      let collectionId = null;
      if (requestId) {
        const requestDef = await prisma.requestDefinition.findUnique({
          where: { id: requestId },
          select: { collectionId: true }
        });
        if (requestDef) {
          collectionId = requestDef.collectionId;
        }
      }

      // Create the MongoDB history document using your existing schema
      const executionLog = await ExecutionLog.create({
        requestId: requestId || null,
        collectionId: collectionId,
        workspaceId,
        environmentId: null, // Optional: You could pass this from the frontend if needed
        method: method || 'GET',
        url: url,
        
        // We only save the metadata to save bandwidth and DB space.
        // We do NOT save the requestBody or responseBody here because 
        // passing heavy files/JSON over the wire just for logging defeats the purpose of local execution.
        status: responseMeta.status,
        statusText: responseMeta.statusText,
        responseSize: responseMeta.size,
        
        timings: {
          total: responseMeta.time,
          // Since it's a local execution, we might not have the full waterfall 
          // from Electron unless we built a custom HTTP agent. We default to the total.
          dnsLookup: 0,
          tcpConnection: 0,
          tlsHandshake: 0,
          firstByte: 0,
          download: 0,
        },
        
        executedBy: userId,
      });

      res.status(201).json({ success: true, historyId: executionLog._id });
    } catch (error) {
      console.error("History Sync Error:", error);
      res.status(500).json({ error: error.message || 'Failed to sync execution history' });
    }
  }),
};