const clients = new Map();

export const sseService = {
    addClient: (connectionId, res) => {
        // --- BULLETPROOF SSE HEADERS ---
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*' 
        });
        
        // Force Node to send the headers immediately
        res.flushHeaders();

        // Send the initial connection ping
        res.write(`event: connected\ndata: {"status": "SSE stream established"}\n\n`);

        clients.set(connectionId, res);

        const heartbeat = setInterval(() => {
            if (clients.has(connectionId)) {
                res.write(': heartbeat\n\n'); 
                // If you use compression middleware, sometimes res.flush() is needed
                if (res.flush) res.flush(); 
            } else {
                clearInterval(heartbeat);
            }
        }, 15000);

        // Cleanup when the frontend closes the tab/stream
        res.on('close', () => {
            clearInterval(heartbeat);
            clients.delete(connectionId);
        });
    },

    removeClient: (connectionId) => {
        const client = clients.get(connectionId);
        if (client) {
            client.end();
            clients.delete(connectionId);
        }
    },

    sendEvent: (connectionId, eventType, payload) => {
        const client = clients.get(connectionId);
        if (client) {
            client.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
            if (client.flush) client.flush(); // Force push the chunk
        } else {
            console.warn(`[SSE] Client ${connectionId} not found for event ${eventType}`);
        }
    }
};