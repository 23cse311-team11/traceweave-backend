import catchAsync from '../utils/catchAsync.js';
import { sseService } from '../services/sse.service.js';
import { wsRunnerService } from '../services/ws-runner.service.js';
import { environmentService } from '../services/environment.service.js';
import { substituteVariables } from '../services/variableSubstitution.service.js';
import { loadCookieJar } from '../services/cookie.service.js';
import { URL } from 'url';

export const wsController = {
    streamConnection: (req, res) => {
        const { connectionId } = req.query;
        if (!connectionId) return res.status(400).send("connectionId is required");
        sseService.addClient(connectionId, res);
    },

    connectTarget: catchAsync(async (req, res) => {
        const { connectionId, url, headers = {}, params = {}, environmentId, workspaceId } = req.body;
        const userId = req.user.id;
        
        if (!connectionId || !url) {
            return res.status(400).json({ error: "connectionId and url are required" });
        }

        // 1. Build query string from Params
        let finalUrl = url;
        try {
            // Ensure protocol exists for URL parsing
            const safeUrl = finalUrl.includes('://') ? finalUrl : `wss://${finalUrl}`;
            const urlObj = new URL(safeUrl);
            
            // Append UI Params
            Object.entries(params).forEach(([key, val]) => {
                urlObj.searchParams.append(key, val);
            });
            
            finalUrl = urlObj.toString();
        } catch (e) {
            return res.status(400).json({ error: "Invalid URL format" });
        }

        // 2. Setup Config for Variable Substitution
        let configObj = { 
            url: finalUrl, 
            headers: headers 
        };

        if (environmentId && workspaceId) {
             const variables = await environmentService.getVariablesForExecution(
                 environmentId, userId, workspaceId
             );
             configObj = substituteVariables(configObj, variables);
        }

        // 3. Inject Cookie Jar
        if (workspaceId) {
             try {
                 const domain = new URL(configObj.url).hostname;
                 const jar = await loadCookieJar(userId, workspaceId, domain);
                 const cookieString = await jar.getCookieString(configObj.url);
                 
                 if (cookieString) {
                     configObj.headers['Cookie'] = configObj.headers['Cookie']
                         ? `${configObj.headers['Cookie']}; ${cookieString}`
                         : cookieString;
                 }
             } catch (e) {
                 console.warn("WS Cookie Injection failed", e.message);
             }
        }

        // 4. Fire Connection
        await wsRunnerService.connect(connectionId, configObj.url, configObj.headers, {
            userId, workspaceId, environmentId
        });
        
        res.status(200).json({ success: true, message: "Connecting..." });
    }),

    sendMessage: catchAsync(async (req, res) => {
        // ... (Keep existing sendMessage logic) ...
        const { connectionId, message } = req.body;
        if (!connectionId || message === undefined) return res.status(400).json({ error: "Missing fields" });
        wsRunnerService.sendMessage(connectionId, message);
        res.status(200).json({ success: true });
    }),

    disconnectTarget: catchAsync(async (req, res) => {
        // ... (Keep existing disconnect logic) ...
        const { connectionId } = req.body;
        if (!connectionId) return res.status(400).json({ error: "connectionId is required" });
        const result = wsRunnerService.disconnect(connectionId);
        res.status(200).json(result);
    })
};