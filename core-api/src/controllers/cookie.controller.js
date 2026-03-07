import catchAsync from '../utils/catchAsync.js';
import CookieJarModel from '../models/cookie-jar.model.js';

export const cookieController = {
    getCookies: catchAsync(async (req, res) => {
        const { domain, workspaceId } = req.query; 
        const userId = req.user.id;

        if (!workspaceId) return res.status(400).json({ error: "Workspace ID is required" });

        const query = { userId, workspaceId };
        
        if (domain) {
            query.domain = { $regex: domain, $options: 'i' };
        }

        const cookies = await CookieJarModel.find(query).sort({ domain: 1, key: 1 });
        res.json(cookies);
    }),

    // --- NEW: Separate Create Controller ---
    createCookie: catchAsync(async (req, res) => {
        const { workspaceId, domain, key, value, path, secure, httpOnly, expires } = req.body;
        const userId = req.user.id;

        if (!workspaceId || !domain || !key) {
            return res.status(400).json({ error: "WorkspaceId, Domain, and Key are required" });
        }

        // Build the tough-cookie compatible raw object
        const rawCookie = {
            key,
            value,
            domain,
            path: path || '/',
            secure: !!secure,
            httpOnly: !!httpOnly,
            expires: expires ? new Date(expires).toISOString() : 'Infinity'
        };

        const newCookie = await CookieJarModel.create({
            userId, 
            workspaceId, 
            domain, 
            key, 
            value,
            path: path || '/',
            secure: !!secure,
            httpOnly: !!httpOnly,
            expires: expires ? new Date(expires) : null,
            raw: rawCookie,
            lastAccessed: new Date()
        });

        res.status(201).json(newCookie);
    }),

    // --- NEW: Separate Update Controller ---
    updateCookie: catchAsync(async (req, res) => {
        const { cookieId } = req.params;
        const { domain, key, value, path, secure, httpOnly, expires } = req.body;
        const userId = req.user.id;

        if (!domain || !key) {
            return res.status(400).json({ error: "Domain and Key are required for update" });
        }

        // Build the updated tough-cookie compatible raw object
        const rawCookie = {
            key,
            value,
            domain,
            path: path || '/',
            secure: !!secure,
            httpOnly: !!httpOnly,
            expires: expires ? new Date(expires).toISOString() : 'Infinity'
        };

        const updatedCookie = await CookieJarModel.findOneAndUpdate(
            { _id: cookieId, userId }, // Ensure user owns the cookie
            {
                domain, 
                key, 
                value,
                path: path || '/',
                secure: !!secure,
                httpOnly: !!httpOnly,
                expires: expires ? new Date(expires) : null,
                raw: rawCookie,
                lastAccessed: new Date()
            },
            { new: true } // Return the updated document
        );

        if (!updatedCookie) {
            return res.status(404).json({ error: "Cookie not found" });
        }

        res.status(200).json(updatedCookie);
    }),

    deleteCookie: catchAsync(async (req, res) => {
        const { cookieId } = req.params;
        await CookieJarModel.deleteOne({ _id: cookieId, userId: req.user.id });
        res.status(204).send();
    }),

    clearCookies: catchAsync(async (req, res) => {
         const { domain, workspaceId } = req.query;
         if (!domain) return res.status(400).json({ error: "Domain is required" });
         
         await CookieJarModel.deleteMany({ 
             userId: req.user.id,
             workspaceId,
             domain: domain
         });
         res.status(204).send();
    })
};