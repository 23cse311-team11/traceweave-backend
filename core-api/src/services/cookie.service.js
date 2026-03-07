import { CookieJar, Cookie } from 'tough-cookie';
import CookieJarModel from '../models/cookie-jar.model.js';

/**
 * Loads cookies from Mongo into a fresh Tough-Cookie Jar
 */
export const loadCookieJar = async (userId, workspaceId, domain) => {
  // CRITICAL FIX: Disable Public Suffix checks for Dev Tool flexibility
  const jar = new CookieJar(null, { rejectPublicSuffixes: false });
  
  // 1. Generate domain search list
  const domainsToSearch = [domain];
  if (!domain.startsWith('.')) {
    domainsToSearch.push(`.${domain}`);
  }
  
  const parts = domain.split('.');
  let currentParts = [...parts];
  while (currentParts.length > 2) {
    currentParts.shift();
    const parent = currentParts.join('.');
    domainsToSearch.push(parent);
    domainsToSearch.push(`.${parent}`);
  }

  // 2. Fetch relevant cookies
  const storedCookies = await CookieJarModel.find({
    userId,
    workspaceId,
    domain: { $in: domainsToSearch }
  });

  // 3. Put them into the Jar
  for (const doc of storedCookies) {
    if (doc.raw) {
      try {
        const cookie = Cookie.fromJSON(doc.raw);
        
        // Ensure domain is set for validation
        if (!cookie.domain) {
            cookie.domain = doc.domain;
        }

        // URL Construction
        const cleanDomain = doc.domain.startsWith('.') ? doc.domain.substring(1) : doc.domain;
        const cookieUrl = `https://${cleanDomain}${doc.path || '/'}`;
        
        // CRITICAL FIX: ignoreError: true forces the cookie in, even if the domain looks "public"
        await jar.setCookie(cookie, cookieUrl, { ignoreError: true });
        
      } catch (err) {
        console.warn(`[CookieService] Failed to load cookie ${doc.key}:`, err.message);
      }
    }
  }

  return jar;
};

/**
 * Saves modified cookies from the Jar back to Mongo
 */
export const persistCookieJar = async (jar, userId, workspaceId, responseUrl) => {
  // 1. Get all cookies
  const cookies = await jar.getCookies(responseUrl);

  // 2. Upsert each cookie into Mongo
  for (const cookie of cookies) {
    let domain = cookie.domain;
    if (!domain) {
        domain = new URL(responseUrl).hostname;
    }

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