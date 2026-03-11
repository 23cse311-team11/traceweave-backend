import WebSocket from 'ws';
import { sseService } from './sse.service.js';
import ExecutionLog from '../models/execution.model.js';

const activeSockets = new Map();

export const wsRunnerService = {
    
    connect: (connectionId, url, headers = {}, context = {}) => {
        return new Promise((resolve, reject) => {
            if (activeSockets.has(connectionId)) {
                return reject(new Error("Connection already exists for this ID"));
            }

            try {
                const ws = new WebSocket(url, { headers });

                // Initialize Session Tracking
                const sessionMeta = {
                    ...context,
                    url,
                    headers,
                    startTime: Date.now(),
                    messages: [] // We will push all in/out messages here
                };

                ws.on('open', () => {
                    activeSockets.set(connectionId, { ws, meta: sessionMeta });
                    sseService.sendEvent(connectionId, 'ws_status', { status: 'connected', url });
                    resolve({ success: true, status: 'connected' });
                });

                ws.on('message', (data, isBinary) => {
                    const messageStr = isBinary ? '<Binary Data>' : data.toString('utf8');
                    
                    // Save to memory
                    if (activeSockets.has(connectionId)) {
                        activeSockets.get(connectionId).meta.messages.push({
                            direction: 'incoming',
                            data: messageStr,
                            time: Date.now()
                        });
                    }
                    
                    sseService.sendEvent(connectionId, 'ws_message', { 
                        direction: 'incoming', message: messageStr, timestamp: Date.now()
                    });
                });

                ws.on('close', async (code, reason) => {
                    const session = activeSockets.get(connectionId);
                    if (session) {
                        // SAVE THE SESSION LOG TO MONGODB
                        const duration = Date.now() - session.meta.startTime;
                        const payloadSize = Buffer.byteLength(JSON.stringify(session.meta.messages));

                        try {
                            await ExecutionLog.create({
                                protocol: 'ws',
                                workspaceId: session.meta.workspaceId,
                                environmentId: session.meta.environmentId || null,
                                method: 'WS',
                                url: session.meta.url,
                                status: 101, // 101 Switching Protocols
                                statusText: `Closed (${code})`,
                                requestHeaders: session.meta.headers,
                                responseBody: session.meta.messages, // Store the array of messages!
                                responseSize: payloadSize,
                                timings: { total: duration },
                                executedBy: session.meta.userId
                            });
                        } catch (e) {
                            console.error("Failed to save WS Execution Log:", e);
                        }

                        activeSockets.delete(connectionId);
                    }
                    
                    sseService.sendEvent(connectionId, 'ws_status', { 
                        status: 'disconnected', code, reason: reason.toString() 
                    });
                });

                ws.on('error', (error) => {
                    console.error(`[WS Runner Error] Connection ${connectionId}:`, error);
                    sseService.sendEvent(connectionId, 'ws_error', { error: error.message });
                    if (!activeSockets.has(connectionId)) reject(error);
                });

            } catch (err) {
                reject(err);
            }
        });
    },

    sendMessage: (connectionId, message) => {
        const session = activeSockets.get(connectionId);
        if (!session || session.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected");
        }

        session.ws.send(message);

        // ✨ Save to memory
        session.meta.messages.push({
            direction: 'outgoing',
            data: message,
            time: Date.now()
        });

        sseService.sendEvent(connectionId, 'ws_message', {
            direction: 'outgoing', message: message, timestamp: Date.now()
        });

        return { success: true };
    },

    disconnect: (connectionId) => {
        const session = activeSockets.get(connectionId);
        if (session) {
            session.ws.close(1000, "Closed by Client"); 
            // Note: The ws.on('close') event handles the Mongo DB saving and Map deletion.
            return { success: true };
        }
        return { success: false, error: "Connection not found" };
    }
};