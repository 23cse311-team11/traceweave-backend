import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { findOrCreateUser } from '../services/auth.service.js';

// --- Google Strategy ---
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || 'placeholder-google-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder-google-client-secret',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost/api/v1/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const user = await findOrCreateUser(email, 'google', profile.id, {
          fullName: profile.displayName,
          avatarUrl: profile.photos?.[0]?.value,
        });
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// --- GitHub Strategy ---
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID || 'placeholder-github-client-id',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || 'placeholder-github-client-secret',
      callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost/api/v1/auth/github/callback',
      scope: ['user:email'], // Important to get email!
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // GitHub specific: Email might be private, so profile.emails might need checking
        const email = profile.emails?.[0]?.value;
        
        if (!email) {
            return done(new Error("No email found from GitHub profile"), null);
        }

        const user = await findOrCreateUser(email, 'github', profile.id, {
          fullName: profile.displayName || profile.username,
          avatarUrl: profile.photos?.[0]?.value,
        });
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

export default passport;