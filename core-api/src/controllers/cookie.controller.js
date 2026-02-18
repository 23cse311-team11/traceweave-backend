import catchAsync from '../utils/catchAsync.js';
import CookieJarModel from '../models/cookie-jar.model.js';

export const cookieController = {
    // GET /jar/cookies?workspaceId=... (&domain=... optional)
    getCookies: catchAsync(async (req, res) => {
        const { domain, workspaceId } = req.query; 
        const userId = req.user.id;

        if (!workspaceId) return res.status(400).json({ error: "Workspace ID is required" });

        const query = { userId, workspaceId };
        
        // If domain is provided, use regex. If not, fetch ALL for workspace.
        if (domain) {
            query.domain = { $regex: domain, $options: 'i' };
        }

        const cookies = await CookieJarModel.find(query).sort({ domain: 1, key: 1 });
        res.json(cookies);
    }),

    // POST /jar/cookies (Create or Update a manual cookie)
    upsertCookie: catchAsync(async (req, res) => {
        const { workspaceId, domain, key, value, path, secure, httpOnly, expires } = req.body;
        const userId = req.user.id;

        if (!workspaceId || !domain || !key) {
            return res.status(400).json({ error: "WorkspaceId, Domain, and Key are required" });
        }

        // Upsert logic
        const cookie = await CookieJarModel.findOneAndUpdate(
            { userId, workspaceId, domain, key, path: path || '/' },
            {
                userId, workspaceId, domain, key, value,
                path: path || '/',
                secure: !!secure,
                httpOnly: !!httpOnly,
                expires: expires ? new Date(expires) : null,
                lastAccessed: new Date()
            },
            { upsert: true, new: true }
        );

        res.status(200).json(cookie);
    }),

    // DELETE /jar/cookies/:cookieId (Keep as is)
    deleteCookie: catchAsync(async (req, res) => {
        const { cookieId } = req.params;
        await CookieJarModel.deleteOne({ _id: cookieId, userId: req.user.id });
        res.status(204).send();
    }),

    // DELETE /jar/cookies (Clear domain)
    clearCookies: catchAsync(async (req, res) => {
         const { domain, workspaceId } = req.query;
         // Safety: Require domain to avoid wiping entire workspace accidentally
         if (!domain) return res.status(400).json({ error: "Domain is required" });
         
         await CookieJarModel.deleteMany({ 
             userId: req.user.id,
             workspaceId,
             domain: domain
         });
         res.status(204).send();
    })
};