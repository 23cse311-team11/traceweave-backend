import WebSocket from 'ws';
import { sseService } from './sse.service.js';

// Map to hold actual active WebSocket instances
// Key: connectionId, Value: WebSocket instance
const activeSockets = new Map();

export const wsRunnerService = {
    
    connect: (connectionId, url, headers = {}) => {
        return new Promise((resolve, reject) => {
            if (activeSockets.has(connectionId)) {
                return reject(new Error("Connection already exists for this ID"));
            }

            try {
                // Initialize WS Client
                const ws = new WebSocket(url, {
                    headers: headers
                });

                // --- BIND EVENTS ---
                ws.on('open', () => {
                    activeSockets.set(connectionId, ws);
                    // Push to frontend via SSE
                    sseService.sendEvent(connectionId, 'ws_status', { status: 'connected', url });
                    resolve({ success: true, status: 'connected' });
                });

                ws.on('message', (data, isBinary) => {
                    // Convert Buffer to String. (For Sprint 1, we handle text. Binary support can be added later).
                    const messageStr = isBinary ? '<Binary Data>' : data.toString('utf8');
                    
                    sseService.sendEvent(connectionId, 'ws_message', { 
                        direction: 'incoming', 
                        message: messageStr,
                        timestamp: Date.now()
                    });
                });

                ws.on('close', (code, reason) => {
                    activeSockets.delete(connectionId);
                    sseService.sendEvent(connectionId, 'ws_status', { 
                        status: 'disconnected', 
                        code, 
                        reason: reason.toString() 
                    });
                });

                ws.on('error', (error) => {
                    sseService.sendEvent(connectionId, 'ws_error', { error: error.message });
                    // If error happens before 'open', reject the initial promise
                    if (!activeSockets.has(connectionId)) {
                        reject(error);
                    }
                });

            } catch (err) {
                reject(err);
            }
        });
    },

    sendMessage: (connectionId, message) => {
        const ws = activeSockets.get(connectionId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected");
        }

        // Send to target server
        ws.send(message);

        // Echo back to frontend so UI can show the "Sent" bubble
        sseService.sendEvent(connectionId, 'ws_message', {
            direction: 'outgoing',
            message: message,
            timestamp: Date.now()
        });

        return { success: true };
    },

    disconnect: (connectionId) => {
        const ws = activeSockets.get(connectionId);
        if (ws) {
            ws.close(1000, "Closed by Client"); // 1000 is normal closure
            activeSockets.delete(connectionId);
            return { success: true };
        }
        return { success: false, error: "Connection not found" };
    }
};