import catchAsync from '../utils/catchAsync.js';
import { sseService } from '../services/sse.service.js';
import { wsRunnerService } from '../services/ws-runner.service.js';

export const wsController = {
    // 1. Establish SSE Stream (Frontend calls this via EventSource)
    streamConnection: (req, res) => {
        const { connectionId } = req.query;
        if (!connectionId) {
            return res.status(400).send("connectionId is required");
        }
        // Start SSE
        sseService.addClient(connectionId, res);
    },

    // 2. Connect to Target WS
    connectTarget: catchAsync(async (req, res) => {
        const { connectionId, url, headers } = req.body;
        
        if (!connectionId || !url) {
            return res.status(400).json({ error: "connectionId and url are required" });
        }

        // We could implement variable substitution and Auth injection here 
        // just like we did for HTTP/GraphQL, but let's get the base working first.

        await wsRunnerService.connect(connectionId, url, headers || {});
        res.status(200).json({ success: true, message: "Connecting..." });
    }),

    // 3. Send Message
    sendMessage: catchAsync(async (req, res) => {
        const { connectionId, message } = req.body;

        if (!connectionId || message === undefined) {
            return res.status(400).json({ error: "connectionId and message are required" });
        }

        wsRunnerService.sendMessage(connectionId, message);
        res.status(200).json({ success: true });
    }),

    // 4. Disconnect
    disconnectTarget: catchAsync(async (req, res) => {
        const { connectionId } = req.body;
        
        if (!connectionId) {
            return res.status(400).json({ error: "connectionId is required" });
        }

        const result = wsRunnerService.disconnect(connectionId);
        res.status(200).json(result);
    })
};