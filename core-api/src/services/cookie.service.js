import { CookieJar, Cookie } from 'tough-cookie';
import CookieJarModel from '../models/cookie-jar.model.js';
import { promisify } from 'util';

/**
 * Loads cookies from Mongo into a fresh Tough-Cookie Jar
 */
export const loadCookieJar = async (userId, workspaceId, domain) => {
  const jar = new CookieJar();
  
  // 1. Fetch relevant cookies from Mongo
  // We fetch cookies for the specific domain and parent domains (basic logic)
  // tough-cookie handles the strict matching, we just need to load candidates.
  const storedCookies = await CookieJarModel.find({
    userId,
    workspaceId,
    // Simple regex to match domain or subdomains. 
    // In production, we might load all cookies for the workspace to be safe, 
    // but filtering by domain string inclusion is a good optimization.
    domain: { $regex: domain, $options: 'i' } 
  });

  // 2. Put them into the Jar
  for (const doc of storedCookies) {
    // If we stored the raw object, we can reconstruct
    if (doc.raw) {
      const cookie = Cookie.fromJSON(doc.raw);
      // We must handle the URL for the cookie to be placed correctly
      // We assume https for now to allow Secure cookies to be set
      const cookieUrl = `https://${doc.domain}${doc.path || '/'}`;
      await jar.setCookie(cookie, cookieUrl);
    }
  }

  return jar;
};

/**
 * Saves modified cookies from the Jar back to Mongo
 */
export const persistCookieJar = async (jar, userId, workspaceId, responseUrl) => {
  // 1. Get all cookies from the jar for this URL
  const cookies = await jar.getCookies(responseUrl);

  // 2. Upsert each cookie into Mongo
  for (const cookie of cookies) {
    const domain = cookie.domain || new URL(responseUrl).hostname;
    
    // Serialized JSON from tough-cookie
    const rawCookie = cookie.toJSON();

    await CookieJarModel.findOneAndUpdate(
      {
        userId,
        workspaceId,
        domain: domain,
        key: cookie.key,
        path: cookie.path || '/'
      },
      {
        userId,
        workspaceId,
        domain,
        key: cookie.key,
        value: cookie.value,
        path: cookie.path || '/',
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        expires: cookie.expires === 'Infinity' ? null : cookie.expires,
        raw: rawCookie,
        lastAccessed: new Date()
      },
      { upsert: true, new: true }
    );
  }
};

/**
 * Helper to Clear Cookies (Logout logic)
 */
export const clearUserCookies = async (userId) => {
  await CookieJarModel.deleteMany({ userId });
};